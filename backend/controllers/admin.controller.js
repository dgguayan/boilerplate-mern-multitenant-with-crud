import Joi from 'joi';
import * as userService from '../services/user.service.js';
import * as logService from '../services/log.service.js';
import { PERMISSIONS, ROLES } from '../config/permissions.js';
import { LOG_CATEGORIES } from '../models/AuditLog.model.js';
import { audit } from '../utils/audit.js';
import * as apiResponse from '../utils/apiResponse.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const query = (schema, values) => {
  const { value, error } = schema.validate(values, { stripUnknown: true });
  if (error) throw Object.assign(new Error(error.details[0].message.replace(/"/g, "'")), { status: 422 });
  return value;
};

const ROLE_KEYS = ROLES.map((r) => r.key);
const roleName = (key) => ROLES.find((r) => r.key === key)?.name || key;

/* ---------------------------------- Users --------------------------------- */

const listUsersQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  role: Joi.string().valid(...ROLE_KEYS),
  status: Joi.string().valid('active', 'inactive'),
  sort: Joi.string().valid('name', 'email', 'role', 'lastLogin', 'createdAt').default('name'),
  direction: Joi.string().valid('asc', 'desc').default('asc'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const createUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().trim().email().max(200).required(),
  role: Joi.string().valid(...ROLE_KEYS).default('user'),
  password: Joi.string().min(8).max(72).required(),
  isActive: Joi.boolean().default(true),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60),
  role: Joi.string().valid(...ROLE_KEYS),
  isActive: Joi.boolean(),
}).min(1);

export const listUsers = handle(async (req, res) => {
  const params = query(listUsersQuery, req.query);
  const result = await userService.listUsers({ tenantId: req.user.tenantId, ...params });
  return apiResponse.success(res, result);
});

export const createUser = handle(async (req, res) => {
  const user = await userService.createUser({ actor: req.user, data: req.body });
  audit(req, {
    action: 'user.created',
    category: 'user',
    summary: `Added ${user.name} as ${roleName(user.role)}`,
    target: { type: 'user', id: user._id, label: user.email },
    metadata: { role: user.role },
  });
  return apiResponse.created(res, { user }, 'User created');
});

export const updateUser = handle(async (req, res) => {
  const { before, after } = await userService.updateUser({ actor: req.user, id: req.params.id, data: req.body });
  const target = { type: 'user', id: after._id, label: after.email };
  if (before.role !== after.role) {
    audit(req, {
      action: 'user.role_changed',
      category: 'user',
      summary: `Changed ${after.name}'s role from ${roleName(before.role)} to ${roleName(after.role)}`,
      target,
      metadata: { from: before.role, to: after.role },
    });
  }
  if (before.isActive !== after.isActive) {
    audit(req, {
      action: after.isActive ? 'user.activated' : 'user.deactivated',
      category: 'user',
      summary: `${after.isActive ? 'Reactivated' : 'Deactivated'} ${after.name}`,
      target,
    });
  }
  if (before.name !== after.name) {
    audit(req, { action: 'user.updated', category: 'user', summary: `Renamed ${before.name} to ${after.name}`, target, metadata: { from: before.name, to: after.name } });
  }
  return apiResponse.success(res, { user: after }, 'User updated');
});

/* ---------------------------------- Roles --------------------------------- */

export const listRoles = handle(async (req, res) => {
  const counts = await userService.roleCounts(req.user.tenantId);
  const roles = ROLES.map((role) => ({ ...role, users: counts[role.key]?.total || 0, activeUsers: counts[role.key]?.active || 0 }));
  return apiResponse.success(res, { roles, permissions: PERMISSIONS });
});

/* ---------------------------------- Logs ---------------------------------- */

const logsQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  category: Joi.string().valid(...LOG_CATEGORIES),
  status: Joi.string().valid('success', 'failure'),
  action: Joi.string().max(60),
  actorId: Joi.string().hex().length(24),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

export const listLogs = handle(async (req, res) => {
  const params = query(logsQuery, req.query);
  const result = await logService.listLogs({ tenantId: req.user.tenantId, ...params });
  return apiResponse.success(res, result);
});

export const logFacets = handle(async (req, res) => {
  return apiResponse.success(res, await logService.logFacets({ tenantId: req.user.tenantId }));
});

export const exportLogs = handle(async (req, res) => {
  const params = query(logsQuery, req.query);
  const csv = await logService.exportLogs({ tenantId: req.user.tenantId, ...params });
  audit(req, { action: 'logs.exported', category: 'admin', summary: 'Exported the activity log', metadata: { filters: params } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="logs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
