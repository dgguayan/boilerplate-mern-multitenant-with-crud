// Integration tests for event replies (RSVP) against a throwaway database (<db>_rsvp_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${uri.pathname.slice(1) || 'app'}_rsvp_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};

async function api(who, method, path, body) {
  const res = await fetch(`${base}/api/calendar${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const day = 86_400_000;
const inDays = (n, hour = 10) => {
  const d = new Date(Date.now() + n * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const createEvent = async (fields) => {
  const res = await api('manager', 'POST', '/events', {
    title: 'Event',
    start: inDays(5),
    end: inDays(5, 11),
    timeZone: 'UTC',
    visibility: 'restricted',
    ...fields,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.event;
};
const reply = (who, id, status, occurrence) => api(who, 'PUT', `/events/${id}/rsvp`, { status, ...(occurrence && { occurrence }) });

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme, other] = await Tenant.create([
    { name: 'Acme', slug: 'acme-rsvp' },
    { name: 'Other', slug: 'other-rsvp' },
  ]);
  const make = async (key, role, tenant) => {
    const user = await User.create({ name: key, email: `${key}@rsvp.test`, passwordHash: 'x'.repeat(60), role, tenantId: tenant._id });
    tokens[key] = signAccessToken({ userId: user._id, tenantId: tenant._id, role });
  };
  await make('manager', 'manager', acme);
  await make('manager2', 'manager', acme);
  await make('admin', 'admin', acme);
  for (const n of ['u1', 'u2', 'u3', 'u4']) await make(n, 'user', acme);
  await make('outsider', 'admin', other);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('capacity: going until full, then waitlist; a freed place goes to the longest-waiting', async () => {
  const event = await createEvent({ title: 'Small workshop', capacity: 2 });

  assert.equal((await reply('u1', event._id, 'going')).body.data.mine.status, 'going');
  assert.equal((await reply('u2', event._id, 'going')).body.data.spotsLeft, 0);

  const third = await reply('u3', event._id, 'going');
  assert.equal(third.status, 200);
  assert.equal(third.body.data.mine.status, 'waitlist');
  assert.equal(third.body.data.mine.waitlistPosition, 1);
  assert.match(third.body.message, /waitlist/);
  assert.equal((await reply('u4', event._id, 'going')).body.data.mine.waitlistPosition, 2);

  // Saying "going" again keeps your place in the queue rather than moving you to the back.
  assert.equal((await reply('u3', event._id, 'going')).body.data.mine.waitlistPosition, 1);

  // u1 can't go any more: u3 (waited longest) gets the place, u4 moves up.
  await reply('u1', event._id, 'declined');
  const u3 = await api('u3', 'GET', `/events/${event._id}/rsvp`);
  assert.equal(u3.body.data.mine.status, 'going');
  const u4 = await api('u4', 'GET', `/events/${event._id}/rsvp`);
  assert.equal(u4.body.data.mine.waitlistPosition, 1);
  assert.deepEqual(u4.body.data.counts, { going: 2, maybe: 0, declined: 1, waitlist: 1 });
});

test('maybe never uses a place; going after maybe takes one if free', async () => {
  const event = await createEvent({ title: 'Lunch', capacity: 1 });
  await reply('u1', event._id, 'maybe');
  await reply('u2', event._id, 'maybe');
  const summary = (await reply('u1', event._id, 'going')).body.data;
  assert.equal(summary.mine.status, 'going');
  assert.equal(summary.counts.maybe, 1);
  assert.equal((await reply('u2', event._id, 'going')).body.data.mine.status, 'waitlist');
});

test('closed events: deadline, cancelled, past and drafts', async () => {
  const deadlinePassed = await createEvent({ title: 'Deadline passed', registrationDeadline: inDays(-1) });
  const closed = await reply('u1', deadlinePassed._id, 'going');
  assert.equal(closed.status, 409);
  assert.match(closed.body.message, /deadline/i);
  // You can still say you can't make it.
  assert.equal((await reply('u1', deadlinePassed._id, 'declined')).status, 200);

  const cancelled = await createEvent({ title: 'Cancelled', status: 'cancelled' });
  assert.equal((await reply('u1', cancelled._id, 'going')).status, 409);

  const past = await createEvent({ title: 'Past', start: inDays(-3), end: inDays(-3, 11) });
  const pastReply = await reply('u1', past._id, 'declined');
  assert.equal(pastReply.status, 409);
  assert.match(pastReply.body.message, /ended/);

  const summary = (await api('u1', 'GET', `/events/${deadlinePassed._id}/rsvp`)).body.data;
  assert.equal(summary.open, false);
  assert.match(summary.reason, /deadline/i);
});

test('recurring events: each occurrence has its own answers; an edited occurrence keeps them', async () => {
  const series = await createEvent({
    title: 'Weekly class',
    start: inDays(3),
    end: inDays(3, 11),
    capacity: 1,
    recurrence: { freq: 'daily', interval: 1, end: { type: 'count', count: 5 } },
  });
  const first = inDays(3).slice(0, 10);
  const second = inDays(4).slice(0, 10);

  const missing = await reply('u1', series._id, 'going');
  assert.equal(missing.status, 422);

  await reply('u1', series._id, 'going', first);
  assert.equal((await reply('u2', series._id, 'going', second)).body.data.mine.status, 'going');
  assert.equal((await reply('u2', series._id, 'going', first)).body.data.mine.status, 'waitlist');

  // Edit the first occurrence on its own; its answers move with it.
  const edited = await api('manager', 'PUT', `/events/${series._id}`, { scope: 'this', occurrenceKey: first, data: { title: 'Weekly class (moved)' } });
  assert.equal(edited.status, 200);
  const range = `?start=${inDays(2)}&end=${inDays(9)}`;
  const occs = (await api('u1', 'GET', `/occurrences${range}`)).body.data.occurrences;
  const override = occs.find((o) => o.title === 'Weekly class (moved)');
  assert.ok(override?.isOverride);
  assert.equal(override.myRsvp, 'going');
  assert.equal(occs.find((o) => o.recurrenceKey === second).myRsvp, null);

  const viaOverride = (await api('u2', 'GET', `/events/${override.eventId}/rsvp`)).body.data;
  assert.equal(viaOverride.mine.status, 'waitlist');
});

test('attendee list: the event’s organizers only; other tenants see nothing', async () => {
  const event = await createEvent({ title: 'Town hall', capacity: 10 });
  await api('u1', 'PUT', `/events/${event._id}/rsvp`, { status: 'going', note: 'Bringing slides' });
  await reply('u2', event._id, 'maybe');

  const list = await api('manager', 'GET', `/events/${event._id}/attendees`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.attendees.map((a) => [a.name, a.status, a.note]), [
    ['u1', 'going', 'Bringing slides'],
    ['u2', 'maybe', ''],
  ]);
  assert.equal((await api('admin', 'GET', `/events/${event._id}/attendees`)).status, 200);
  assert.equal((await api('manager2', 'GET', `/events/${event._id}/attendees`)).status, 403);
  assert.equal((await api('u1', 'GET', `/events/${event._id}/attendees`)).status, 403);
  assert.equal((await api('u1', 'GET', `/events/${event._id}/rsvp`)).body.data.canSeeAttendees, false);

  assert.equal((await reply('outsider', event._id, 'going')).status, 404);
  assert.equal((await api('outsider', 'GET', `/events/${event._id}/rsvp`)).status, 404);
});

test('validation: only going, maybe or declined', async () => {
  const event = await createEvent({ title: 'Validation' });
  assert.equal((await reply('u1', event._id, 'waitlist')).status, 422);
  assert.equal((await reply('u1', event._id, 'yes')).status, 422);
  assert.equal((await api('u1', 'PUT', `/events/${event._id}/rsvp`, { status: 'going', note: 'x'.repeat(301) })).status, 422);
});
