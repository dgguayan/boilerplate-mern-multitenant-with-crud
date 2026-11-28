// Integration tests for the public calendar (no sign-in) against a throwaway database (<db>_public_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${uri.pathname.slice(1) || 'app'}_public_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'https://app.example.com';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};
const ids = {};

async function call(who, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(who && { Authorization: `Bearer ${tokens[who]}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}
const visitor = (path) => call(null, 'GET', `/public${path}`);

const day = 86_400_000;
const inDays = (n, hour = 10) => {
  const d = new Date(Date.now() + n * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const range = `start=${inDays(-1)}&end=${inDays(60)}`;
async function createEvent(fields) {
  const res = await call('admin', 'POST', '/calendar/events', { start: inDays(5), end: inDays(5, 11), timeZone: 'UTC', ...fields });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.event;
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme, other] = await Tenant.create([
    { name: 'Acme', slug: 'acme-pub' },
    { name: 'Quiet', slug: 'quiet-pub' },
  ]);
  for (const [key, role, tenant] of [['admin', 'admin', acme], ['manager', 'manager', acme], ['quiet', 'admin', other]]) {
    const user = await User.create({ name: key, email: `${key}@pub.test`, passwordHash: 'x'.repeat(60), role, tenantId: tenant._id });
    tokens[key] = signAccessToken({ userId: user._id, tenantId: tenant._id, role });
  }
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const cat = async (name, visibility) =>
    (await call('admin', 'POST', '/calendar/categories', { name, color: '#2563eb', visibility })).body.data.category._id;
  ids.publicCat = await cat('Talks', 'public');
  ids.membersCat = await cat('Internal', 'restricted');

  ids.open = (await createEvent({ title: 'Open talk', visibility: 'public', categoryId: ids.publicCat, description: 'Everyone welcome' }))._id;
  ids.noCat = (await createEvent({ title: 'Street fair', visibility: 'public' }))._id;
  ids.cancelled = (await createEvent({ title: 'Cancelled meetup', visibility: 'public', status: 'cancelled' }))._id;
  await createEvent({ title: 'Members only', visibility: 'restricted' });
  await createEvent({ title: 'Secret draft', visibility: 'public', status: 'draft' });
  await createEvent({ title: 'Public but internal category', visibility: 'public', categoryId: ids.membersCat });
  await createEvent({ title: 'Archived', visibility: 'public', status: 'archived' });
  ids.series = (
    await createEvent({ title: 'Weekly walk', visibility: 'public', start: inDays(2), end: inDays(2, 11), recurrence: { freq: 'weekly', interval: 1, end: { type: 'count', count: 4 } } })
  )._id;
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('off by default: nothing is public until an admin turns it on', async () => {
  assert.equal((await visitor(`/acme-pub/events?${range}`)).status, 404);
  assert.equal((await visitor('/acme-pub/calendar.ics')).status, 404);

  const sharing = await call('admin', 'GET', '/calendar/sharing');
  assert.equal(sharing.body.data.publicEnabled, false);
  assert.equal(sharing.body.data.slug, 'acme-pub');
  assert.equal((await call('manager', 'PUT', '/calendar/sharing', { publicEnabled: true })).status, 403);
  const on = await call('admin', 'PUT', '/calendar/sharing', { publicEnabled: true });
  assert.equal(on.body.data.publicEnabled, true);
  assert.equal(on.body.data.publicEvents, 4);
});

test('lists only public, visible events — never drafts, members-only, archived or internal categories', async () => {
  const res = await visitor(`/acme-pub/events?${range}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-cache/);
  const titles = [...new Set(res.body.data.occurrences.map((o) => o.title))].sort();
  assert.deepEqual(titles, ['Cancelled meetup', 'Open talk', 'Street fair', 'Weekly walk']);
  assert.equal(res.body.data.occurrences.filter((o) => o.title === 'Weekly walk').length, 4);
  assert.deepEqual(res.body.data.categories.map((c) => c.name), ['Talks']);
  for (const o of res.body.data.occurrences) {
    assert.equal(o.canEdit, undefined);
    assert.equal(o.resourceIds, undefined);
  }

  const talks = await visitor(`/acme-pub/events?${range}&category=${ids.publicCat}`);
  assert.deepEqual(talks.body.data.occurrences.map((o) => o.title), ['Open talk']);
  const internal = await visitor(`/acme-pub/events?${range}&category=${ids.membersCat}`);
  assert.deepEqual(internal.body.data.occurrences, []);
});

test('event page: public fields only, upcoming dates for a series, counts a view', async () => {
  const list = (await visitor(`/acme-pub/events?${range}`)).body.data.occurrences;
  const talkSlug = list.find((o) => o.title === 'Open talk').slug;
  const res = await visitor(`/acme-pub/events/${talkSlug}`);
  assert.equal(res.status, 200);
  const { event } = res.body.data;
  assert.equal(event.title, 'Open talk');
  assert.equal(event.description, 'Everyone welcome');
  assert.equal(event.category.name, 'Talks');
  for (const hidden of ['createdBy', 'updatedBy', 'tenantId', 'resourceIds', 'externalUid', 'deleted']) assert.equal(event[hidden], undefined, hidden);
  assert.equal((await visitor(`/acme-pub/events/${talkSlug}`)).body.data.event.viewCount, 2);

  const walk = await visitor(`/acme-pub/events/${list.find((o) => o.title === 'Weekly walk').slug}`);
  assert.equal(walk.body.data.upcoming.length, 4);

  // A members-only event is not found, even by its exact slug.
  const members = (await call('admin', 'GET', `/calendar/occurrences?${range}`)).body.data.occurrences.find((o) => o.title === 'Members only');
  assert.equal((await visitor(`/acme-pub/events/${members.slug}`)).status, 404);
});

test('subscribe feed and per-event .ics link to the public pages', async () => {
  const feed = await visitor('/acme-pub/calendar.ics');
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('content-type'), /text\/calendar/);
  assert.match(feed.body, /X-WR-CALNAME:Acme events|NAME:Acme events/);
  assert.match(feed.body, /SUMMARY:Open talk/);
  assert.match(feed.body, /RRULE:FREQ=WEEKLY/);
  assert.doesNotMatch(feed.body, /Members only|Secret draft|internal category|Archived/);
  assert.match(feed.body, /URL:https:\/\/app\.example\.com\/p\/acme-pub\/events\/open-talk-/);

  const walkSlug = (await visitor(`/acme-pub/events?${range}`)).body.data.occurrences.find((o) => o.title === 'Weekly walk');
  const one = await visitor(`/acme-pub/events/${walkSlug.slug}/ics?occurrence=${walkSlug.recurrenceKey}`);
  assert.equal(one.status, 200);
  assert.doesNotMatch(one.body, /RRULE/);
});

test('other workspaces stay private; bad input is rejected', async () => {
  assert.equal((await visitor(`/quiet-pub/events?${range}`)).status, 404);
  assert.equal((await visitor('/acme-pub/events')).status, 422);
  assert.equal((await visitor(`/acme-pub/events?start=${inDays(0)}&end=${inDays(500)}`)).status, 422);
  assert.equal((await visitor('/ACME_PUB/events')).status, 404);

  await call('admin', 'PUT', '/calendar/sharing', { publicEnabled: false });
  assert.equal((await visitor(`/acme-pub/events?${range}`)).status, 404);
});
