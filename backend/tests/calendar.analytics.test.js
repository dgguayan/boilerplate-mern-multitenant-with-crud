// Integration tests for calendar insights (<db>_analytics_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${uri.pathname.slice(1) || 'app'}_analytics_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};

async function cal(who, method, path, body) {
  const res = await fetch(`${base}/api/calendar${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// A future week (Mon 2027-06-07 … Sun 06-13) so replies are still open.
const at = (day, hour) => `2027-06-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
const range = `?start=${at(7, 0)}&end=${at(14, 0)}&tz=UTC`;

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme] = await Tenant.create([{ name: 'Acme', slug: 'acme-analytics' }]);
  for (const [key, role] of [['admin', 'admin'], ['manager', 'manager'], ['u1', 'user'], ['u2', 'user'], ['u3', 'user']]) {
    const user = await User.create({ name: key, email: `${key}@analytics.test`, passwordHash: 'x'.repeat(60), role, tenantId: acme._id });
    tokens[key] = signAccessToken({ userId: user._id, tenantId: acme._id, role });
  }
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const talks = (await cal('admin', 'POST', '/categories', { name: 'Talks', color: '#2563eb' })).body.data.category._id;
  const room = (await cal('admin', 'POST', '/resources', { name: 'Hall', type: 'room' })).body.data.resource._id;
  const make = async (fields) => (await cal('manager', 'POST', '/events', { timeZone: 'UTC', visibility: 'restricted', ...fields })).body.data.event;

  // Monday: a 3-hour talk in the Hall, 2 places.
  const talk = await make({ title: 'Big talk', start: at(7, 9), end: at(7, 12), categoryId: talks, resourceIds: [room], capacity: 2 });
  // Wednesday: an uncategorised 1-hour meeting in the Hall, 4 places.
  const meeting = await make({ title: 'Small meeting', start: at(9, 14), end: at(9, 15), resourceIds: [room], capacity: 4 });
  // Wednesday: a cancelled event (counted apart, not as activity).
  await make({ title: 'Called off', start: at(9, 10), end: at(9, 11), status: 'cancelled' });

  for (const who of ['u1', 'u2', 'u3']) await cal(who, 'PUT', `/events/${talk._id}/rsvp`, { status: 'going' }); // 2 going + 1 waitlist
  await cal('u1', 'PUT', `/events/${meeting._id}/rsvp`, { status: 'going' });
  await cal('u2', 'PUT', `/events/${meeting._id}/rsvp`, { status: 'maybe' });
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('only organizers see insights', async () => {
  assert.equal((await cal('u1', 'GET', `/analytics${range}`)).status, 403);
  assert.equal((await cal('manager', 'GET', `/analytics${range}`)).status, 200);
});

test('totals, replies and how full events got', async () => {
  const { totals, replies } = (await cal('admin', 'GET', `/analytics${range}`)).body.data;
  assert.equal(totals.events, 2);
  assert.equal(totals.cancelled, 1);
  assert.deepEqual(replies, { going: 3, maybe: 1, declined: 0, waitlist: 1 });
  assert.equal(totals.fullEvents, 1);
  // Big talk 2/2 = 100%, small meeting 1/4 = 25% → average 62.5%.
  assert.equal(totals.averageFill, 0.625);
});

test('when: per weekday, per week and per category', async () => {
  const data = (await cal('admin', 'GET', `/analytics${range}`)).body.data;
  assert.deepEqual(data.perWeekday.map((d) => d.count), [1, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(data.perWeek, [{ week: '2027-06-07', count: 2 }]);
  assert.deepEqual(data.perCategory, [
    { name: 'Talks', count: 1 },
    { name: 'Uncategorised', count: 1 },
  ]);
});

test('room use counts booked working hours against Mon–Fri 9–6', async () => {
  const [hall] = (await cal('admin', 'GET', `/analytics${range}`)).body.data.resources;
  assert.equal(hall.name, 'Hall');
  assert.equal(hall.bookedHours, 4);
  assert.equal(hall.availableHours, 45); // 5 weekdays × 9 hours
  assert.ok(Math.abs(hall.utilization - 4 / 45) < 1e-9);
});

test('top lists, and bad ranges are rejected', async () => {
  const data = (await cal('admin', 'GET', `/analytics${range}`)).body.data;
  assert.deepEqual(data.mostReplied.map((e) => [e.title, e.going, e.waitlist]), [
    ['Big talk', 2, 1],
    ['Small meeting', 1, 0],
  ]);
  assert.equal((await cal('admin', 'GET', `/analytics?start=${at(14, 0)}&end=${at(7, 0)}`)).status, 422);
  assert.equal((await cal('admin', 'GET', `/analytics?start=2026-01-01T00:00:00Z&end=2027-12-31T00:00:00Z`)).status, 422);
  assert.equal((await cal('admin', 'GET', `/analytics${range.replace('tz=UTC', 'tz=Not/AZone')}`)).status, 422);
});
