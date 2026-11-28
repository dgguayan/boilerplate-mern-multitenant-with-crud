// Integration tests for rooms that can't be double-booked (<db>_booking_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${uri.pathname.slice(1) || 'app'}_booking_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};
const rooms = {};

async function cal(who, method, path, body) {
  const res = await fetch(`${base}/api/calendar${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const at = (day, hour) => `2027-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
const book = (who, fields) =>
  cal(who, 'POST', '/events', { title: 'Booking', start: at(1, 10), end: at(1, 11), timeZone: 'UTC', visibility: 'restricted', ...fields });

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme] = await Tenant.create([{ name: 'Acme', slug: 'acme-booking' }]);
  for (const [key, role] of [['admin', 'admin'], ['manager', 'manager'], ['manager2', 'manager']]) {
    const user = await User.create({ name: key, email: `${key}@booking.test`, passwordHash: 'x'.repeat(60), role, tenantId: acme._id });
    tokens[key] = signAccessToken({ userId: user._id, tenantId: acme._id, role });
  }
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const make = async (name, exclusive) => (await cal('admin', 'POST', '/resources', { name, type: 'room', exclusive })).body.data.resource;
  rooms.boardroom = await make('Boardroom', true);
  rooms.lounge = await make('Lounge', false);
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('an exclusive room refuses an overlapping booking and says what it clashes with', async () => {
  assert.equal(rooms.boardroom.exclusive, true);
  const first = await book('manager', { title: 'Board meeting', resourceIds: [rooms.boardroom._id] });
  assert.equal(first.status, 201);

  const clash = await book('manager2', { title: 'Interview', start: at(1, 10), end: at(1, 12), resourceIds: [rooms.boardroom._id] });
  assert.equal(clash.status, 409);
  assert.match(clash.body.message, /Boardroom is already booked: “Board meeting”/);
  assert.equal(clash.body.details.conflicts[0].resourceName, 'Boardroom');

  // Back to back is fine; so is overlapping in a room that allows it.
  assert.equal((await book('manager2', { start: at(1, 11), end: at(1, 12), resourceIds: [rooms.boardroom._id] })).status, 201);
  assert.equal((await book('manager2', { resourceIds: [rooms.lounge._id] })).status, 201);
  assert.equal((await book('manager2', { resourceIds: [rooms.lounge._id] })).status, 201);
});

test('drafts and cancelled events neither block nor are blocked', async () => {
  const draft = await book('manager', { title: 'Tentative', start: at(2, 9), end: at(2, 10), status: 'draft', resourceIds: [rooms.boardroom._id] });
  assert.equal(draft.status, 201);
  const real = await book('manager2', { title: 'Confirmed', start: at(2, 9), end: at(2, 10), resourceIds: [rooms.boardroom._id] });
  assert.equal(real.status, 201);
  // Publishing the draft now would double-book.
  const publish = await cal('manager', 'PUT', `/events/${draft.body.data.event._id}`, { data: { status: 'published' } });
  assert.equal(publish.status, 409);
});

test('moving an event into a clash is refused; editing it in place is not', async () => {
  const a = (await book('manager', { title: 'A', start: at(3, 9), end: at(3, 10), resourceIds: [rooms.boardroom._id] })).body.data.event;
  await book('manager', { title: 'B', start: at(3, 14), end: at(3, 15), resourceIds: [rooms.boardroom._id] });

  assert.equal((await cal('manager', 'PUT', `/events/${a._id}`, { data: { title: 'A (renamed)' } })).status, 200);
  const moved = await cal('manager', 'PUT', `/events/${a._id}`, { data: { start: at(3, 14), end: at(3, 15) } });
  assert.equal(moved.status, 409);
  assert.match(moved.body.message, /“B”/);
});

test('a series is checked on every date, and its own dates never clash with each other', async () => {
  // Something on the third Monday.
  await book('admin', { title: 'Third-week workshop', start: at(15, 9), end: at(15, 12), resourceIds: [rooms.boardroom._id] });
  const weekly = await book('manager', {
    title: 'Weekly sync',
    start: at(1, 9),
    end: at(1, 10),
    resourceIds: [rooms.boardroom._id],
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [1], end: { type: 'count', count: 4 } },
  });
  assert.equal(weekly.status, 409);
  assert.match(weekly.body.message, /Third-week workshop/);

  const fine = await book('manager', {
    title: 'Weekly sync',
    start: at(1, 7),
    end: at(1, 8),
    resourceIds: [rooms.boardroom._id],
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [1], end: { type: 'count', count: 4 } },
  });
  assert.equal(fine.status, 201);
  // Editing the whole series in place doesn't clash with itself.
  assert.equal((await cal('manager', 'PUT', `/events/${fine.body.data.event._id}`, { scope: 'all', data: { title: 'Weekly sync (B)' } })).status, 200);
});

test('people who can’t see the other event learn only that the room is busy', async () => {
  await book('admin', { title: 'Secret board call', start: at(20, 9), end: at(20, 10), visibility: 'private', resourceIds: [rooms.boardroom._id] });
  const clash = await book('manager', { start: at(20, 9), end: at(20, 10), resourceIds: [rooms.boardroom._id] });
  assert.equal(clash.status, 409);
  assert.match(clash.body.message, /“Busy”/);
  assert.doesNotMatch(JSON.stringify(clash.body), /Secret/);
});

test('duplicating leaves exclusive rooms off the copy', async () => {
  const source = (await book('manager', { title: 'Offsite prep', start: at(25, 9), end: at(25, 10), resourceIds: [rooms.boardroom._id, rooms.lounge._id] })).body.data.event;
  const copy = await cal('manager', 'POST', `/events/${source._id}/duplicate`);
  assert.equal(copy.status, 201);
  assert.deepEqual(copy.body.data.event.resourceIds, [rooms.lounge._id]);
  assert.match(copy.body.message, /left off the copy/);
});
