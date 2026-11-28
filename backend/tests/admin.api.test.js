// Integration tests for /api/admin (users, roles, logs) against a throwaway database (<db>_admin_test).
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

const uri = new URL(process.env.MONGO_URI);
uri.pathname = `/${(uri.pathname.slice(1) || 'app')}_admin_test`;
process.env.MONGO_URI = uri.toString();
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: Tenant } = await import('../models/Tenant.model.js');
const { default: User } = await import('../models/User.model.js');
const { signAccessToken } = await import('../utils/jwt.js');

let server;
let base;
const tokens = {};
const ids = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(role, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(role && { Authorization: `Bearer ${tokens[role]}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
}

/** Audit writes are fire-and-forget; poll until the expected entry shows up. */
async function findLog(role, params, predicate) {
  for (let i = 0; i < 20; i++) {
    const res = await call(role, 'GET', `/admin/logs?${new URLSearchParams(params)}`);
    const hit = res.body.data.logs.find(predicate);
    if (hit) return hit;
    await wait(50);
  }
  return null;
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const [acme, other] = await Tenant.create([{ name: 'Acme', slug: 'acme-admin-test' }, { name: 'Other', slug: 'other-admin-test' }]);
  const passwordHash = await bcrypt.hash('Password123!', 4);
  const make = async (key, role, tenant, email) => {
    const user = await User.create({ name: `${key} person`, email, passwordHash, role, tenantId: tenant._id });
    ids[key] = String(user._id);
    tokens[key] = signAccessToken({ userId: user._id, tenantId: tenant._id, role, name: user.name });
  };
  await make('superadmin', 'superadmin', acme, 'super@example.com');
  await make('admin', 'admin', acme, 'admin@example.com');
  await make('manager', 'manager', acme, 'manager@example.com');
  await make('user', 'user', acme, 'user@example.com');
  await make('outsider', 'admin', other, 'outsider@example.com');
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('only administrators can reach the admin API', async () => {
  assert.equal((await call('manager', 'GET', '/admin/users')).status, 403);
  assert.equal((await call('user', 'GET', '/admin/logs')).status, 403);
  assert.equal((await call(null, 'GET', '/admin/roles')).status, 401);
  assert.equal((await call('admin', 'GET', '/admin/users')).status, 200);
});

test('user list is tenant-scoped, searchable and never exposes password hashes', async () => {
  const res = await call('admin', 'GET', '/admin/users?search=manager');
  assert.equal(res.body.data.users.length, 1);
  assert.equal(res.body.data.users[0].email, 'manager@example.com');
  assert.equal(res.body.data.users[0].passwordHash, undefined);
  assert.equal(res.body.data.counts.total, 4);
  assert.equal(res.body.data.counts.byRole.admin, 1);
  const outsider = await call('outsider', 'GET', '/admin/users');
  assert.deepEqual(outsider.body.data.users.map((u) => u.email), ['outsider@example.com']);
});

test('create users, change roles and deactivate, with escalation guards', async () => {
  const created = await call('admin', 'POST', '/admin/users', { name: 'New Hire', email: 'NEW@example.com', role: 'manager', password: 'Password123!' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.user.email, 'new@example.com');
  assert.equal((await call('admin', 'POST', '/admin/users', { name: 'Dup', email: 'new@example.com', password: 'Password123!' })).status, 409);
  assert.equal((await call('admin', 'POST', '/admin/users', { name: 'Boss', email: 'boss@example.com', role: 'superadmin', password: 'Password123!' })).status, 403);
  assert.equal((await call('admin', 'POST', '/admin/users', { name: 'Weak', email: 'weak@example.com', password: 'short' })).status, 422);

  const id = created.body.data.user._id;
  const promoted = await call('admin', 'PUT', `/admin/users/${id}`, { role: 'admin' });
  assert.equal(promoted.body.data.user.role, 'admin');
  assert.equal((await call('admin', 'PUT', `/admin/users/${ids.superadmin}`, { isActive: false })).status, 403);
  assert.equal((await call('admin', 'PUT', `/admin/users/${ids.admin}`, { role: 'user' })).status, 422);
  assert.equal((await call('admin', 'PUT', `/admin/users/${ids.admin}`, { isActive: false })).status, 422);
  assert.equal((await call('outsider', 'PUT', `/admin/users/${id}`, { isActive: false })).status, 404);

  const deactivated = await call('admin', 'PUT', `/admin/users/${id}`, { isActive: false });
  assert.equal(deactivated.body.data.user.isActive, false);
  const login = await call(null, 'POST', '/auth/login', { email: 'new@example.com', password: 'Password123!' });
  assert.equal(login.status, 401, 'deactivated users cannot sign in');
});

test('roles endpoint returns roles with user counts and the permission matrix', async () => {
  const res = await call('admin', 'GET', '/admin/roles');
  const roles = Object.fromEntries(res.body.data.roles.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(roles), ['superadmin', 'admin', 'manager', 'user']);
  assert.equal(roles.manager.users, 1);
  const projects = res.body.data.permissions.find((m) => m.module === 'Projects');
  assert.equal(projects.actions.find((a) => a.key === 'projects.delete').access.manager, 'own');
});

test('activity is logged: sign-ins, failed sign-ins, user and project changes', async () => {
  const ok = await call(null, 'POST', '/auth/login', { email: 'manager@example.com', password: 'Password123!' });
  assert.equal(ok.status, 200);
  await call(null, 'POST', '/auth/login', { email: 'user@example.com', password: 'wrong-password' });
  const project = await call('manager', 'POST', '/projects', { title: 'Audit me' });
  assert.equal(project.status, 201);

  const login = await findLog('admin', { category: 'auth' }, (l) => l.action === 'auth.login' && l.actor.email === 'manager@example.com');
  assert.ok(login, 'successful sign-in logged');
  assert.ok(login.ip);
  const failed = await findLog('admin', { status: 'failure' }, (l) => l.action === 'auth.login_failed');
  assert.match(failed.summary, /user@example\.com/);
  const role = await findLog('admin', { category: 'user' }, (l) => l.action === 'user.role_changed');
  assert.deepEqual(role.metadata, { from: 'manager', to: 'admin' });
  const created = await findLog('admin', { search: 'Audit me' }, (l) => l.action === 'project.created');
  assert.equal(created.actor.name, 'manager person');

  // Other tenants never see these entries
  const outsider = await call('outsider', 'GET', '/admin/logs');
  assert.ok(outsider.body.data.logs.every((l) => !l.summary?.includes('Audit me')));

  const facets = await call('admin', 'GET', '/admin/logs/facets');
  assert.ok(facets.body.data.actions.includes('project.created'));
  assert.ok(facets.body.data.actors.some((a) => a.id === ids.manager));

  const csv = await call('admin', 'GET', '/admin/logs/export?category=project');
  assert.match(csv.body, /Time \(UTC\),User/);
  assert.match(csv.body, /Audit me/);
});
