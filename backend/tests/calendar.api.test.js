// Integration tests for /api/calendar against a throwaway database (<db>_calendar_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${(uri.pathname.slice(1) || 'app')}_calendar_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};

async function api(role, method, path, body, headers = {}) {
  const res = await fetch(`${base}/api/calendar${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      ...(body !== undefined && typeof body !== 'string' && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme, other] = await Tenant.create([
    { name: 'Acme', slug: 'acme-test' },
    { name: 'Other', slug: 'other-test' },
  ]);
  const make = async (role, tenant, email) => {
    const user = await User.create({ name: role, email, passwordHash: 'x'.repeat(60), role, tenantId: tenant._id });
    return signAccessToken({ userId: user._id, tenantId: tenant._id, role });
  };
  tokens.admin = await make('admin', acme, 'admin@t.test');
  tokens.manager = await make('manager', acme, 'manager@t.test');
  tokens.manager2 = await make('manager', acme, 'manager2@t.test');
  tokens.user = await make('user', acme, 'user@t.test');
  tokens.outsider = await make('admin', other, 'outsider@t.test');
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

const weekRange = '?start=2026-06-01T00:00:00Z&end=2026-06-29T00:00:00Z';

test('roles: categories by admins, events by managers, read-only users', async () => {
  const forbidden = await api('manager', 'POST', '/categories', { name: 'Talks', color: '#2563eb' });
  assert.equal(forbidden.status, 403);
  const category = await api('admin', 'POST', '/categories', { name: 'Talks', color: '#2563eb', icon: 'presentation' });
  assert.equal(category.status, 201);

  const userCreate = await api('user', 'POST', '/events', { title: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' });
  assert.equal(userCreate.status, 403);

  const created = await api('manager', 'POST', '/events', {
    title: 'Launch talk', start: '2026-06-02T10:00:00Z', end: '2026-06-02T11:00:00Z', timeZone: 'Europe/Paris',
    categoryId: category.body.data.category._id, visibility: 'restricted',
  });
  assert.equal(created.status, 201);
  assert.match(created.body.data.event.slug, /^launch-talk-[0-9a-f]{8}$/);

  // Another manager can see but not edit it; the user can see it; another tenant can't.
  const id = created.body.data.event._id;
  assert.equal((await api('manager2', 'PUT', `/events/${id}`, { data: { title: 'Hijack' } })).status, 403);
  assert.equal((await api('user', 'GET', `/events/${id}`)).status, 200);
  assert.equal((await api('outsider', 'GET', `/events/${id}`)).status, 404);
  const outsiderList = await api('outsider', 'GET', `/occurrences${weekRange}`);
  assert.equal(outsiderList.body.data.occurrences.length, 0);
});

test('validation rejects unsafe links and bad times', async () => {
  const badLink = await api('manager', 'POST', '/events', {
    title: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z', virtualUrl: 'javascript:alert(1)',
  });
  assert.equal(badLink.status, 422);
  const badTimes = await api('manager', 'POST', '/events', { title: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T09:00:00Z' });
  assert.equal(badTimes.status, 422);
  const badZone = await api('manager', 'POST', '/events', { title: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z', timeZone: 'Mars/Base' });
  assert.equal(badZone.status, 422);
});

test('private events and drafts stay hidden from other members', async () => {
  const priv = await api('manager', 'POST', '/events', { title: 'Secret', start: '2026-06-03T10:00:00Z', end: '2026-06-03T11:00:00Z', visibility: 'private' });
  const draft = await api('manager', 'POST', '/events', { title: 'Draft', start: '2026-06-03T12:00:00Z', end: '2026-06-03T13:00:00Z', status: 'draft' });
  const userTitles = (await api('user', 'GET', `/occurrences${weekRange}`)).body.data.occurrences.map((o) => o.title);
  assert.ok(!userTitles.includes('Secret') && !userTitles.includes('Draft'));
  const ownerTitles = (await api('manager', 'GET', `/occurrences${weekRange}`)).body.data.occurrences.map((o) => o.title);
  assert.ok(ownerTitles.includes('Secret') && ownerTitles.includes('Draft'));
  const adminTitles = (await api('admin', 'GET', `/occurrences${weekRange}`)).body.data.occurrences.map((o) => o.title);
  assert.ok(adminTitles.includes('Secret'));
  assert.equal((await api('user', 'GET', `/events/${priv.body.data.event._id}`)).status, 404);
  assert.equal((await api('user', 'GET', `/events/${draft.body.data.event._id}`)).status, 404);
});

test('recurring series: edit this, edit following, delete one, and undo', async () => {
  const zone = 'America/New_York';
  const created = await api('manager', 'POST', '/events', {
    title: 'Sync', start: '2026-06-01T13:00:00Z', end: '2026-06-01T13:30:00Z', timeZone: zone,
    recurrence: { freq: 'weekly', byWeekday: [1, 3], end: { type: 'count', count: 8 } },
  });
  const id = created.body.data.event._id;
  const syncs = async () =>
    (await api('manager', 'GET', `/occurrences${weekRange}`)).body.data.occurrences.filter((o) => o.title.startsWith('Sync'));

  assert.equal((await syncs()).length, 8);

  // Move only Wednesday June 3 one hour later
  const one = await api('manager', 'PUT', `/events/${id}`, {
    scope: 'this', occurrenceKey: '2026-06-03', data: { start: '2026-06-03T14:00:00Z', end: '2026-06-03T14:30:00Z', title: 'Sync (moved)' },
  });
  assert.equal(one.status, 200);
  let list = await syncs();
  assert.equal(list.length, 8);
  assert.ok(list.some((o) => o.title === 'Sync (moved)' && o.isOverride && o.recurrenceKey === '2026-06-03'));

  // Rename from June 15 on: the series is split and the count carries over (8 total)
  const following = await api('manager', 'PUT', `/events/${id}`, { scope: 'following', occurrenceKey: '2026-06-15', data: { title: 'Sync v2' } });
  assert.equal(following.status, 200);
  list = await syncs();
  assert.equal(list.length, 8);
  assert.equal(list.filter((o) => o.title === 'Sync v2').length, 4);

  // Delete one occurrence, then undo it with the returned snapshots
  const removed = await api('manager', 'DELETE', `/events/${id}?scope=this&occurrence=2026-06-08`);
  assert.equal(removed.status, 200);
  assert.equal((await syncs()).length, 7);
  const undo = await api('manager', 'POST', '/revert', {
    changes: removed.body.data.changes.map((c) => ({ id: c.id, state: c.before })),
  });
  assert.equal(undo.status, 200);
  assert.equal((await syncs()).length, 8);

  // Undo the split as well
  await api('manager', 'POST', '/revert', {
    changes: following.body.data.changes.map((c) => ({ id: c.id, state: c.before })),
  });
  list = await syncs();
  assert.equal(list.length, 8);
  assert.equal(list.filter((o) => o.title === 'Sync v2').length, 0);
});

test('resource conflicts are reported without leaking private titles', async () => {
  const room = await api('admin', 'POST', '/resources', { name: 'Room A', type: 'room', capacity: 8 });
  const roomId = room.body.data.resource._id;
  await api('admin', 'POST', '/events', {
    title: 'Board meeting', visibility: 'private', start: '2026-06-10T09:00:00Z', end: '2026-06-10T10:00:00Z', resourceIds: [roomId],
  });
  const clash = await api('manager', 'POST', '/events', {
    title: 'Workshop', start: '2026-06-10T09:30:00Z', end: '2026-06-10T11:00:00Z', resourceIds: [roomId],
  });
  assert.equal(clash.status, 201);
  assert.equal(clash.body.data.conflicts.length, 1);
  assert.equal(clash.body.data.conflicts[0].title, 'Busy');
  const check = await api('manager', 'POST', '/conflicts', { start: '2026-06-10T10:30:00Z', end: '2026-06-10T12:00:00Z', resourceIds: [roomId] });
  assert.equal(check.body.data.conflicts[0].title, 'Workshop');
});

test('ICS and CSV export, then import with duplicate detection', async () => {
  const ics = await api('manager', 'GET', '/export?format=ics&start=2026-06-01T00:00:00Z&end=2026-07-01T00:00:00Z');
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.body, /BEGIN:VCALENDAR/);
  assert.match(ics.body, /RRULE:FREQ=WEEKLY/);

  // Read raw bytes: fetch's text() would silently drop the UTF-8 BOM Excel needs.
  const csvRes = await fetch(`${base}/api/calendar/export?format=csv&start=2026-06-01T00:00:00Z&end=2026-07-01T00:00:00Z`, {
    headers: { Authorization: `Bearer ${tokens.manager}` },
  });
  const bytes = Buffer.from(await csvRes.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(bytes.toString('utf8', 3), /^Title,Start,End/);

  const external = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:ext-1@example.com', 'DTSTART:20260620T150000Z', 'DTEND:20260620T160000Z',
    'SUMMARY:Imported webinar', 'LOCATION:https://meet.example.com/x', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const first = await api('manager', 'POST', '/import?format=ics&timeZone=UTC', external, { 'Content-Type': 'text/calendar' });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.created, 1);
  const again = await api('manager', 'POST', '/import?format=ics&timeZone=UTC', external, { 'Content-Type': 'text/calendar' });
  assert.equal(again.body.data.created, 0);
  assert.equal(again.body.data.duplicates, 1);

  const csvImport = await api('manager', 'POST', '/import?format=csv&timeZone=Europe/Paris',
    'Title,Start,End,Category\nCSV event,2026-06-22 10:00,2026-06-22 11:00,Talks\n', { 'Content-Type': 'text/csv' });
  assert.equal(csvImport.body.data.created, 1, JSON.stringify(csvImport.body.data.warnings));
  const list = (await api('manager', 'GET', `/occurrences${weekRange}`)).body.data.occurrences;
  const csvEvent = list.find((o) => o.title === 'CSV event');
  assert.equal(new Date(csvEvent.start).toISOString(), '2026-06-22T08:00:00.000Z'); // 10:00 Paris (CEST)
  assert.ok(csvEvent.categoryId);

  assert.equal((await api('user', 'POST', '/import?format=csv', 'Title,Start\nx,2026-06-01', { 'Content-Type': 'text/csv' })).status, 403);
});

test('single event .ics, duplicate and range limit', async () => {
  const created = await api('manager', 'POST', '/events', { title: 'Offsite', start: '2026-06-24', end: '2026-06-26', allDay: true });
  const id = created.body.data.event._id;
  const ics = await api('user', 'GET', `/events/${id}/ics`);
  assert.match(ics.body, /DTSTART;VALUE=DATE:20260624/);
  assert.match(ics.body, /DTEND;VALUE=DATE:20260626/);
  const copy = await api('manager', 'POST', `/events/${id}/duplicate`);
  assert.equal(copy.body.data.event.title, 'Offsite (copy)');
  const tooLong = await api('manager', 'GET', '/occurrences?start=2026-01-01T00:00:00Z&end=2028-01-01T00:00:00Z');
  assert.equal(tooLong.status, 422);
});
