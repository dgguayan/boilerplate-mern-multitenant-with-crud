import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import User from '../models/User.model.js';
import { rank } from '../config/permissions.js';

const SALT_ROUNDS = 12;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PUBLIC_FIELDS = 'name email role isActive lastLogin createdAt updatedAt';
const SORTS = { name: 'name', email: 'email', role: 'role', lastLogin: 'lastLogin', createdAt: 'createdAt' };

export async function listUsers({ tenantId, search, role, status, sort = 'name', direction = 'asc', page = 1, limit = 20 }) {
  const tenant = new mongoose.Types.ObjectId(String(tenantId));
  const filter = { tenantId: tenant };
  if (role) filter.role = role;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (search) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [users, total, summary] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ [SORTS[sort] || 'name']: direction === 'desc' ? -1 : 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate([
      { $match: { tenantId: tenant } },
      { $group: { _id: { role: '$role', active: '$isActive' }, count: { $sum: 1 } } },
    ]),
  ]);

  const counts = { total: 0, active: 0, inactive: 0, byRole: {} };
  for (const { _id, count } of summary) {
    counts.total += count;
    counts[_id.active ? 'active' : 'inactive'] += count;
    counts.byRole[_id.role] = (counts.byRole[_id.role] || 0) + count;
  }
  return { users, counts, pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } };
}

/** Admins may assign roles up to their own; only super admins may hand out "superadmin". */
function assertCanAssign(actor, role) {
  if (rank(role) > rank(actor.role)) throw httpError(403, 'You cannot assign a role higher than your own.');
}

export async function createUser({ actor, data }) {
  assertCanAssign(actor, data.role);
  const email = data.email.toLowerCase();
  if (await User.exists({ tenantId: actor.tenantId, email })) {
    throw httpError(409, 'A user with this email already exists in this workspace.');
  }
  const user = await User.create({
    name: data.name,
    email,
    role: data.role,
    isActive: data.isActive ?? true,
    passwordHash: await bcrypt.hash(data.password, SALT_ROUNDS),
    tenantId: actor.tenantId,
  });
  return User.findById(user._id).select(PUBLIC_FIELDS).lean();
}

/** Updates name, role or active status. Returns the user before and after the change. */
export async function updateUser({ actor, id, data }) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'User not found');
  const user = await User.findOne({ _id: id, tenantId: actor.tenantId });
  if (!user) throw httpError(404, 'User not found');

  const isSelf = String(user._id) === String(actor.userId);
  if (isSelf && ((data.role && data.role !== user.role) || data.isActive === false)) {
    throw httpError(422, 'You cannot change your own role or deactivate your own account.');
  }
  if (rank(user.role) > rank(actor.role)) throw httpError(403, 'You cannot change a user with a higher role than yours.');
  if (data.role) assertCanAssign(actor, data.role);

  const before = { name: user.name, role: user.role, isActive: user.isActive };
  if (data.name !== undefined) user.name = data.name;
  if (data.role !== undefined) user.role = data.role;
  if (data.isActive !== undefined) user.isActive = data.isActive;
  await user.save();

  const after = await User.findById(user._id).select(PUBLIC_FIELDS).lean();
  return { before, after };
}

export async function roleCounts(tenantId) {
  const rows = await User.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)) } },
    { $group: { _id: '$role', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, { total: r.total, active: r.active }]));
}
