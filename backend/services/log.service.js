import mongoose from 'mongoose';
import AuditLog, { RETENTION_DAYS } from '../models/AuditLog.model.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter({ tenantId, search, category, status, actorId, action, from, to }) {
  const filter = { tenantId: new mongoose.Types.ObjectId(String(tenantId)) };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (action) filter.action = action;
  if (actorId && mongoose.isValidObjectId(actorId)) filter['actor.userId'] = new mongoose.Types.ObjectId(actorId);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ summary: pattern }, { 'actor.name': pattern }, { 'actor.email': pattern }, { 'target.label': pattern }, { action: pattern }, { ip: pattern }];
  }
  return filter;
}

export async function listLogs({ page = 1, limit = 25, ...query }) {
  const filter = buildFilter(query);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { logs, pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } };
}

/** Values for the filter dropdowns: people and actions that appear in this tenant's log. */
export async function logFacets({ tenantId }) {
  const tenant = new mongoose.Types.ObjectId(String(tenantId));
  const [actors, actions] = await Promise.all([
    AuditLog.aggregate([
      { $match: { tenantId: tenant, 'actor.userId': { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$actor.userId', name: { $first: '$actor.name' }, email: { $first: '$actor.email' } } },
      { $sort: { name: 1 } },
      { $limit: 500 },
    ]),
    AuditLog.distinct('action', { tenantId: tenant }),
  ]);
  return {
    actors: actors.map((a) => ({ id: String(a._id), name: a.name, email: a.email })),
    actions: actions.sort(),
    retentionDays: RETENTION_DAYS,
  };
}

const MAX_EXPORT = 10_000;

/** CSV with formula injection neutralised and a BOM for Excel. */
export async function exportLogs(query) {
  const logs = await AuditLog.find(buildFilter(query)).sort({ createdAt: -1 }).limit(MAX_EXPORT).lean();
  const cell = (value) => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['Time (UTC)', 'User', 'Email', 'Role', 'Action', 'Category', 'Result', 'Target', 'Summary', 'IP address', 'Details'];
  const rows = logs.map((l) =>
    [
      new Date(l.createdAt).toISOString(),
      l.actor?.name,
      l.actor?.email,
      l.actor?.role,
      l.action,
      l.category,
      l.status,
      l.target?.label,
      l.summary,
      l.ip,
      l.metadata ? JSON.stringify(l.metadata) : '',
    ]
      .map(cell)
      .join(',')
  );
  return '﻿' + [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
