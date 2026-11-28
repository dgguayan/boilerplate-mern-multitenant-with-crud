// Integration tests for in-app notifications against a throwaway database (<db>_notify_test).
import 'dotenv/config';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${uri.pathname.slice(1) || 'app'}_notify_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { default: Notification } = await import('../models/Notification.model.js');
const { signAccessToken } = await import('../utils/jwt.js');
const { sendDueReminders } = await import('../services/notification.service.js');

let server;
let base;
const tokens = {};

async function call(who, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const cal = (who, method, path, body) => call(who, method, `/calendar${path}`, body);
const inbox = async (who) => (await call(who, 'GET', '/notifications')).body.data;
const types = async (who) => (await inbox(who)).notifications.map((n) => n.type);

const hour = 3_600_000;
const at = (hoursFromNow) => new Date(Date.now() + hoursFromNow * hour).toISOString();
async function createEvent(fields) {
  const res = await cal('manager', 'POST', '/events', {
    title: 'Event',
    start: at(72),
    end: at(73),
    timeZone: 'UTC',
    visibility: 'restricted',
    ...fields,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.event;
}
const reply = (who, id, status, occurrence) => cal(who, 'PUT', `/events/${id}/rsvp`, { status, ...(occurrence && { occurrence }) });

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
  const [acme] = await Tenant.create([{ name: 'Acme', slug: 'acme-notify' }]);
  for (const [key, role] of [['manager', 'manager'], ['u1', 'user'], ['u2', 'user'], ['u3', 'user']]) {
    const user = await User.create({ name: key, email: `${key}@notify.test`, passwordHash: 'x'.repeat(60), role, tenantId: acme._id });
    tokens[key] = signAccessToken({ userId: user._id, tenantId: acme._id, role });
  }
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => Notification.deleteMany({}));

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('a place freeing up notifies the person who leaves the waitlist', async () => {
  const event = await createEvent({ title: 'Masterclass', capacity: 1 });
  await reply('u1', event._id, 'going');
  await reply('u2', event._id, 'going'); // waitlist
  assert.deepEqual(await types('u2'), []);

  await reply('u1', event._id, 'declined');
  const box = await inbox('u2');
  assert.equal(box.unread, 1);
  assert.equal(box.notifications[0].type, 'waitlist_promoted');
  assert.match(box.notifications[0].title, /You got a place at “Masterclass”/);
  assert.equal(box.notifications[0].link, `/calendar?event=${event._id}`);
  assert.deepEqual(await types('u1'), []);
});

test('a time change reaches going, maybe and waitlist — not declined, not the editor', async () => {
  const event = await createEvent({ title: 'Planning', capacity: 1 });
  await reply('u1', event._id, 'going');
  await reply('u2', event._id, 'going'); // waitlist
  await reply('u3', event._id, 'maybe');
  await reply('manager', event._id, 'declined');

  const moved = await cal('manager', 'PUT', `/events/${event._id}`, { data: { start: at(96), end: at(97) } });
  assert.equal(moved.status, 200);
  for (const who of ['u1', 'u2', 'u3']) {
    const [n] = (await inbox(who)).notifications;
    assert.equal(n?.type, 'event_changed', who);
    assert.match(n.title, /“Planning” has a new time/);
    assert.match(n.body, /It now starts/);
  }
  assert.deepEqual(await types('manager'), []);

  // A change people don't need to hear about (the description) sends nothing.
  await cal('manager', 'PUT', `/events/${event._id}`, { data: { description: 'Agenda attached' } });
  assert.equal((await inbox('u1')).notifications.length, 1);
});

test('cancelling and deleting notify attendees', async () => {
  const event = await createEvent({ title: 'Social' });
  await reply('u1', event._id, 'going');
  await cal('manager', 'PUT', `/events/${event._id}`, { data: { status: 'cancelled' } });
  assert.deepEqual(await types('u1'), ['event_cancelled']);

  const other = await createEvent({ title: 'Doomed' });
  await reply('u2', other._id, 'maybe');
  assert.equal((await cal('manager', 'DELETE', `/events/${other._id}`)).status, 200);
  const [n] = (await inbox('u2')).notifications;
  assert.equal(n.type, 'event_deleted');
  assert.equal(n.link, null);
});

test('series: "this and following" moves later replies and notifies only those dates', async () => {
  const series = await createEvent({
    title: 'Daily class',
    start: at(48),
    end: at(49),
    recurrence: { freq: 'daily', interval: 1, end: { type: 'count', count: 6 } },
  });
  const key = (days) => new Date(new Date(series.start).getTime() + days * 24 * hour).toISOString().slice(0, 10);
  await reply('u1', series._id, 'going', key(0));
  await reply('u2', series._id, 'going', key(3));

  const split = await cal('manager', 'PUT', `/events/${series._id}`, {
    scope: 'following',
    occurrenceKey: key(2),
    data: { location: { name: 'Room B' } },
  });
  assert.equal(split.status, 200);
  const newSeriesId = split.body.data.event._id;
  assert.notEqual(newSeriesId, series._id);

  assert.deepEqual(await types('u1'), []);
  const [n] = (await inbox('u2')).notifications;
  assert.equal(n.type, 'event_changed');
  assert.match(n.title, /new place/);
  assert.equal(n.link, `/calendar?event=${newSeriesId}&occurrence=${key(3)}&date=${key(3)}`);

  // u2's reply now lives on the new series.
  const summary = await cal('u2', 'GET', `/events/${newSeriesId}/rsvp?occurrence=${key(3)}`);
  assert.equal(summary.body.data.mine.status, 'going');
});

test('raising capacity lets the waitlist in and tells them', async () => {
  const event = await createEvent({ title: 'Tour', capacity: 1 });
  await reply('u1', event._id, 'going');
  await reply('u2', event._id, 'going');
  await reply('u3', event._id, 'going');
  await cal('manager', 'PUT', `/events/${event._id}`, { data: { capacity: 2 } });
  assert.deepEqual(await types('u2'), ['waitlist_promoted']);
  assert.deepEqual(await types('u3'), []);
  assert.equal((await cal('u3', 'GET', `/events/${event._id}/rsvp`)).body.data.mine.waitlistPosition, 1);
});

test('reminders: once per person, only for events within 24 hours, going or maybe', async () => {
  const soon = await createEvent({ title: 'Standup', start: at(3), end: at(4), location: { name: 'Room A' } });
  const later = await createEvent({ title: 'Next week', start: at(24 * 6), end: at(24 * 6 + 1) });
  await reply('u1', soon._id, 'going');
  await reply('u2', soon._id, 'maybe');
  await reply('u3', soon._id, 'declined');
  await reply('u1', later._id, 'going');

  assert.equal(await sendDueReminders(), 2);
  assert.equal(await sendDueReminders(), 0); // already reminded

  const [r1] = (await inbox('u1')).notifications;
  assert.equal(r1.type, 'event_reminder');
  assert.match(r1.title, /Reminder: “Standup” starts in 3 hours/);
  assert.match(r1.body, /Room A/);
  assert.match((await inbox('u2')).notifications[0].body, /You said maybe/);
  assert.deepEqual(await types('u3'), []);
});

test('API: unread count, mark read by id or all, and people only see their own', async () => {
  const event = await createEvent({ title: 'Read test' });
  await reply('u1', event._id, 'going');
  await cal('manager', 'PUT', `/events/${event._id}`, { data: { location: { name: 'Hall' } } });
  await cal('manager', 'PUT', `/events/${event._id}`, { data: { start: at(80), end: at(81) } });

  assert.equal((await call('u1', 'GET', '/notifications/unread-count')).body.data.unread, 2);
  const [first] = (await inbox('u1')).notifications;
  const marked = await call('u1', 'POST', '/notifications/read', { ids: [first.id] });
  assert.equal(marked.body.data.unread, 1);

  // Someone else can't mark them.
  await call('u2', 'POST', '/notifications/read', { all: true });
  assert.equal((await call('u1', 'GET', '/notifications/unread-count')).body.data.unread, 1);

  await call('u1', 'POST', '/notifications/read', { all: true });
  assert.equal((await call('u1', 'GET', '/notifications/unread-count')).body.data.unread, 0);
  assert.equal((await call('u1', 'POST', '/notifications/read', {})).status, 422);
});
