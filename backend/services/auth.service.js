import bcrypt from 'bcrypt';
import User from '../models/User.model.js';
import Tenant from '../models/Tenant.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

const SALT_ROUNDS = 12;

export const register = async ({ name, email, password, tenantSlug }) => {
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true });
  if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404 });

  const existing = await User.findOne({ email, tenantId: tenant._id });
  if (existing) throw Object.assign(new Error('Email already registered for this tenant'), { status: 409 });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, tenantId: tenant._id });

  return _buildTokens(user, tenant);
};

export const login = async ({ email, password, tenantSlug }) => {
  if (!tenantSlug) return _loginWithoutTenant({ email, password });

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true });
  if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404 });

  const user = await User.findOne({ email, tenantId: tenant._id, isActive: true }).select('+passwordHash');
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  const match = await user.comparePassword(password);
  if (!match) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  user.lastLogin = new Date();
  await user.save();

  return _buildTokens(user, tenant);
};

// Email is unique per tenant, not globally: find the account(s) whose
// password matches across active tenants.
const _loginWithoutTenant = async ({ email, password }) => {
  const invalid = () => Object.assign(new Error('Invalid credentials'), { status: 401 });

  const users = await User.find({ email, isActive: true }).select('+passwordHash');
  if (!users.length) throw invalid();

  const activeTenants = await Tenant.find({
    _id: { $in: users.map((u) => u.tenantId) },
    isActive: true,
  });
  const tenantById = new Map(activeTenants.map((t) => [String(t._id), t]));

  const matches = [];
  for (const user of users) {
    const tenant = tenantById.get(String(user.tenantId));
    if (tenant && (await user.comparePassword(password))) matches.push({ user, tenant });
  }

  if (!matches.length) throw invalid();
  if (matches.length > 1) {
    throw Object.assign(
      new Error('This account exists in multiple workspaces. Please specify a workspace.'),
      { status: 409 }
    );
  }

  const { user, tenant } = matches[0];
  user.lastLogin = new Date();
  await user.save();

  return _buildTokens(user, tenant);
};

export const refresh = async (token) => {
  if (!token) throw Object.assign(new Error('Refresh token required'), { status: 401 });

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) throw Object.assign(new Error('User not found'), { status: 401 });

  const tenant = await Tenant.findById(user.tenantId);
  return _buildTokens(user, tenant);
};

export const confirmPassword = async (userId, password) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.isActive) {
    throw Object.assign(new Error('User not found'), { status: 401 });
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw Object.assign(new Error('The password is incorrect'), { status: 422 });
  }

  return true;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const _buildTokens = (user, tenant) => {
  const payload = {
    userId: user._id.toString(),
    tenantId: tenant._id.toString(),
    role: user.role,
    name: user.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId: user._id.toString() });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: tenant._id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    },
  };
};
