import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import CalendarEvent from '../models/CalendarEvent.model.js';
import CalendarCategory from '../models/CalendarCategory.model.js';
import CalendarResource from '../models/CalendarResource.model.js';
import Tenant from '../models/Tenant.model.js';
import { countBefore, expandOccurrences, firstKey, keyForInstant } from './calendar/recurrence.js';
import { buildIcs, parseIcs, parseRRule } from './calendar/ics.js';
import { buildCsv, parseCsv } from './calendar/csv.js';

/* -------------------------------------------------------------------------- */
/*                                 Permissions                                */
/* -------------------------------------------------------------------------- */

const RANK = { user: 1, manager: 2, admin: 3, superadmin: 4 };
const rank = (role) => RANK[role] || 0;

export const canCreate = (user) => rank(user.role) >= RANK.manager;
export const isAdmin = (user) => rank(user.role) >= RANK.admin;
export const canEditEvent = (user, event) =>
  isAdmin(user) ||
  (rank(user.role) >= RANK.manager && String(event.createdBy?._id ?? event.createdBy) === String(user.userId));

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const MAX_RANGE_DAYS = 400;
const MAX_OCCURRENCES = 5000;

/** Events the user may see: admins see everything; others see non-draft public/restricted events and their own. */
export async function accessFilter(user) {
  const base = { tenantId: user.tenantId, deleted: false };
  if (isAdmin(user)) return base;
  const privateCategories = await CalendarCategory.find({
    tenantId: user.tenantId,
    deleted: false,
    visibility: 'private',
  }).distinct('_id');
  return {
    ...base,
    ...(privateCategories.length && { categoryId: { $nin: privateCategories } }),
    $or: [
      { visibility: { $in: ['public', 'restricted'] }, status: { $ne: 'draft' } },
      { createdBy: user.userId },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Snapshots                                 */
/* -------------------------------------------------------------------------- */

// Fields an editor controls. A snapshot of them is what undo/redo restores.
export const EDITABLE_FIELDS = [
  'title', 'summary', 'description', 'imageUrl', 'start', 'end', 'allDay', 'timeZone',
  'recurrence', 'exdates', 'categoryId', 'color', 'location', 'virtualUrl', 'organizer',
  'contact', 'status', 'capacity', 'registrationDeadline', 'price', 'externalUrl',
  'attachments', 'customFields', 'tags', 'visibility', 'resourceIds',
];

const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

export function snapshot(doc) {
  const source = doc.toObject ? doc.toObject() : doc;
  const state = {};
  for (const field of EDITABLE_FIELDS) state[field] = plain(source[field]);
  state.deleted = Boolean(source.deleted);
  return state;
}

const change = (doc, before) => ({ id: String(doc._id), before, after: doc.deleted ? null : snapshot(doc) });

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const slugify = (title) =>
  title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'event';

// Readable, unique and stable: "/events/team-offsite-3f9a1c2e"
const makeSlug = (title) => `${slugify(title)}-${crypto.randomBytes(4).toString('hex')}`;

const dayBefore = (key) => DateTime.fromISO(key, { zone: 'utc' }).minus({ days: 1 }).toISODate();

/** Normalises times: all-day events become whole UTC days, and end must follow start. */
function normaliseTimes(data, existing = {}) {
  const allDay = data.allDay ?? existing.allDay ?? false;
  const start = data.start ?? existing.start;
  const end = data.end ?? existing.end;
  if (!start || !end) return data;
  let s = new Date(start);
  let e = new Date(end);
  if (allDay) {
    s = DateTime.fromJSDate(s, { zone: 'utc' }).startOf('day').toJSDate();
    e = DateTime.fromJSDate(e, { zone: 'utc' }).startOf('day').toJSDate();
    if (e <= s) e = DateTime.fromJSDate(s, { zone: 'utc' }).plus({ days: 1 }).toJSDate();
  } else if (e <= s) {
    throw httpError(422, 'The end time must be after the start time.');
  }
  const result = { ...data };
  if (data.start !== undefined || data.allDay !== undefined) result.start = s;
  if (data.end !== undefined || data.allDay !== undefined) result.end = e;
  return result;
}

/** Ensures referenced category and resources belong to the tenant. */
async function checkReferences(tenantId, data) {
  if (data.categoryId) {
    const exists = await CalendarCategory.exists({ _id: data.categoryId, tenantId, deleted: false });
    if (!exists) throw httpError(422, 'The selected category does not exist.');
  }
  if (data.resourceIds?.length) {
    const count = await CalendarResource.countDocuments({ _id: { $in: data.resourceIds }, tenantId, deleted: false });
    if (count !== new Set(data.resourceIds.map(String)).size) throw httpError(422, 'A selected resource does not exist.');
  }
}

async function findEditable(user, id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found');
  const event = await CalendarEvent.findOne({ _id: id, tenantId: user.tenantId, deleted: false });
  if (!event) throw httpError(404, 'Event not found');
  if (!canEditEvent(user, event)) throw httpError(403, 'You do not have permission to change this event.');
  return event;
}

/** Start and end of one occurrence of a series. */
export function occurrenceAt(series, key) {
  const day = DateTime.fromISO(key, { zone: 'utc' });
  if (!day.isValid) throw httpError(422, 'Invalid occurrence date.');
  const found = expandOccurrences(
    { ...series, exdates: [] },
    day.minus({ days: 2 }).toJSDate(),
    day.plus({ days: 3 }).toJSDate()
  ).find((o) => o.key === key);
  if (!found) throw httpError(422, 'That occurrence is not part of the series.');
  return found;
}

const SERIES_COPY_FIELDS = EDITABLE_FIELDS.filter((f) => !['recurrence', 'exdates'].includes(f));
function copyFields(source) {
  const obj = source.toObject ? source.toObject() : source;
  const copy = {};
  for (const field of SERIES_COPY_FIELDS) if (obj[field] !== undefined) copy[field] = plain(obj[field]);
  return copy;
}

/* -------------------------------------------------------------------------- */
/*                                 Occurrences                                */
/* -------------------------------------------------------------------------- */

const LIST_FIELDS =
  'title slug summary start end allDay timeZone recurrence exdates seriesId recurrenceKey categoryId color ' +
  'location virtualUrl organizer.name status capacity registrationDeadline price tags visibility resourceIds ' +
  'imageUrl viewCount createdAt createdBy';

function toOccurrence(event, occurrence, user, isSeries) {
  return {
    id: isSeries ? `${event._id}_${occurrence.key}` : String(event._id),
    eventId: String(event._id),
    slug: event.slug,
    seriesId: event.seriesId ? String(event.seriesId) : isSeries ? String(event._id) : null,
    recurrenceKey: isSeries ? occurrence.key : event.recurrenceKey || null,
    isRecurring: isSeries || Boolean(event.seriesId),
    isOverride: Boolean(event.seriesId),
    seriesStart: isSeries ? event.start : null,
    seriesEnd: isSeries ? event.end : null,
    start: occurrence.start,
    end: occurrence.end,
    allDay: event.allDay,
    timeZone: event.timeZone,
    title: event.title,
    summary: event.summary || '',
    categoryId: event.categoryId ? String(event.categoryId) : null,
    color: event.color || null,
    location: event.location || null,
    virtualUrl: event.virtualUrl || null,
    organizer: event.organizer?.name || null,
    status: event.status,
    visibility: event.visibility,
    tags: event.tags || [],
    price: event.price?.amount ? event.price : null,
    capacity: event.capacity ?? null,
    registrationDeadline: event.registrationDeadline || null,
    resourceIds: (event.resourceIds || []).map(String),
    imageUrl: event.imageUrl || null,
    viewCount: event.viewCount || 0,
    createdAt: event.createdAt,
    canEdit: canEditEvent(user, event),
  };
}

/** Expands every visible event into occurrences in [start, end). */
async function expandRange({ filter, start, end, user }) {
  const [singles, series] = await Promise.all([
    CalendarEvent.find({ ...filter, recurrence: null, start: { $lt: end }, end: { $gt: start } })
      .select(LIST_FIELDS)
      .lean(),
    CalendarEvent.find({ ...filter, 'recurrence.freq': { $exists: true }, start: { $lt: end } })
      .select(LIST_FIELDS)
      .lean(),
  ]);

  // Occurrences that were edited individually are replaced by their override documents.
  const overrideKeys = new Map();
  if (series.length) {
    const overrides = await CalendarEvent.find({
      tenantId: filter.tenantId,
      deleted: false,
      seriesId: { $in: series.map((s) => s._id) },
    })
      .select('seriesId recurrenceKey')
      .lean();
    for (const o of overrides) {
      const key = String(o.seriesId);
      if (!overrideKeys.has(key)) overrideKeys.set(key, new Set());
      overrideKeys.get(key).add(o.recurrenceKey);
    }
  }

  const results = [];
  for (const event of singles) {
    results.push(toOccurrence(event, { key: null, start: event.start, end: event.end }, user, false));
  }
  for (const event of series) {
    for (const occ of expandOccurrences(event, start, end, overrideKeys.get(String(event._id)))) {
      results.push(toOccurrence(event, occ, user, true));
      if (results.length > MAX_OCCURRENCES) break;
    }
  }
  results.sort((a, b) => new Date(a.start) - new Date(b.start));
  const truncated = results.length > MAX_OCCURRENCES;
  return { occurrences: truncated ? results.slice(0, MAX_OCCURRENCES) : results, truncated };
}

export async function getOccurrences({ user, start, end }) {
  if (!(start < end)) throw httpError(422, 'The range end must be after its start.');
  if ((end - start) / 86_400_000 > MAX_RANGE_DAYS) {
    throw httpError(422, `The date range can span at most ${MAX_RANGE_DAYS} days.`);
  }
  return expandRange({ filter: await accessFilter(user), start, end, user });
}

/* -------------------------------------------------------------------------- */
/*                                   Events                                   */
/* -------------------------------------------------------------------------- */

export async function getEvent({ user, id, countView = false }) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found');
  const filter = { ...(await accessFilter(user)), _id: id };
  const event = countView
    ? await CalendarEvent.findOneAndUpdate(filter, { $inc: { viewCount: 1 } }, { new: true, timestamps: false })
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .lean()
    : await CalendarEvent.findOne(filter).populate('createdBy', 'name email').populate('updatedBy', 'name email').lean();
  if (!event) throw httpError(404, 'Event not found');

  let series = null;
  if (event.seriesId) {
    series = await CalendarEvent.findOne({ _id: event.seriesId, tenantId: user.tenantId, deleted: false })
      .select('title recurrence start end timeZone allDay exdates')
      .lean();
  }
  return { event: { ...event, canEdit: canEditEvent(user, event) }, series };
}

export async function createEvent({ user, data }) {
  if (!canCreate(user)) throw httpError(403, 'You do not have permission to create events.');
  const values = normaliseTimes(data);
  await checkReferences(user.tenantId, values);
  const event = await CalendarEvent.create({
    ...values,
    slug: makeSlug(values.title),
    tenantId: user.tenantId,
    createdBy: user.userId,
  });
  return { event: event.toObject(), changes: [change(event, null)] };
}

/**
 * Updates an event. For recurring series, `scope` picks what changes:
 *   'this'      only the occurrence `occurrenceKey` (stored as an override document)
 *   'following' that occurrence and all later ones (the series is split in two)
 *   'all'       the whole series
 */
export async function updateEvent({ user, id, scope = 'all', occurrenceKey, data }) {
  const event = await findEditable(user, id);
  await checkReferences(user.tenantId, data);
  const isSeries = Boolean(event.recurrence?.freq);
  const changes = [];

  if (!isSeries || scope === 'all' || (scope === 'following' && occurrenceKey === firstKey(event))) {
    const before = snapshot(event);
    const values = normaliseTimes(data, event);
    if (isSeries && values.recurrence === null) {
      // The series becomes a single event; its edited occurrences no longer apply.
      changes.push(...(await softDeleteOverrides(user, event._id)));
      values.exdates = [];
    }
    Object.assign(event, values, { updatedBy: user.userId });
    await event.save();
    changes.unshift(change(event, before));
    return { event: event.toObject(), changes };
  }

  if (!occurrenceKey) throw httpError(422, 'Choose which occurrence to change.');
  const occurrence = occurrenceAt(event.toObject(), occurrenceKey);

  if (scope === 'this') {
    const existing = await CalendarEvent.findOne({
      tenantId: user.tenantId,
      deleted: false,
      seriesId: event._id,
      recurrenceKey: occurrenceKey,
    });
    if (existing) {
      const before = snapshot(existing);
      Object.assign(existing, normaliseTimes({ ...data, recurrence: null }, existing), { updatedBy: user.userId });
      await existing.save();
      return { event: existing.toObject(), changes: [change(existing, before)] };
    }
    const values = normaliseTimes(
      { start: occurrence.start, end: occurrence.end, ...copyFields(event), ...data, recurrence: null, exdates: [] },
      {}
    );
    const override = await CalendarEvent.create({
      ...values,
      seriesId: event._id,
      recurrenceKey: occurrenceKey,
      slug: makeSlug(values.title),
      tenantId: user.tenantId,
      createdBy: event.createdBy,
      updatedBy: user.userId,
    });
    return { event: override.toObject(), changes: [change(override, null)] };
  }

  if (scope !== 'following') throw httpError(422, 'Unknown edit scope.');

  // Split: the original series ends the day before; a new series starts at this occurrence.
  const before = snapshot(event);
  const rule = plain(event.recurrence);
  const newRecurrence = data.recurrence !== undefined ? plain(data.recurrence) : plain(rule);
  // An unchanged occurrence count carries over: the two halves together keep the original total.
  if (newRecurrence?.end?.type === 'count' && rule.end?.type === 'count' && newRecurrence.end.count === rule.end.count) {
    newRecurrence.end.count = Math.max(1, rule.end.count - countBefore(event.toObject(), occurrenceKey));
  }
  const values = normaliseTimes(
    {
      start: occurrence.start,
      end: occurrence.end,
      ...copyFields(event),
      ...data,
      recurrence: newRecurrence,
      exdates: (event.exdates || []).filter((k) => k >= occurrenceKey),
    },
    {}
  );
  const newSeries = await CalendarEvent.create({
    ...values,
    slug: makeSlug(values.title),
    tenantId: user.tenantId,
    createdBy: event.createdBy,
    updatedBy: user.userId,
  });

  event.recurrence = { ...rule, end: { type: 'until', until: dayBefore(occurrenceKey) } };
  event.exdates = (event.exdates || []).filter((k) => k < occurrenceKey);
  event.updatedBy = user.userId;
  await event.save();

  changes.push(change(event, before), change(newSeries, null));
  changes.push(...(await softDeleteOverrides(user, event._id, occurrenceKey)));
  return { event: newSeries.toObject(), changes };
}

async function softDeleteOverrides(user, seriesId, fromKey = null) {
  const overrides = await CalendarEvent.find({
    tenantId: user.tenantId,
    deleted: false,
    seriesId,
    ...(fromKey && { recurrenceKey: { $gte: fromKey } }),
  });
  const changes = [];
  for (const override of overrides) {
    const before = snapshot(override);
    Object.assign(override, { deleted: true, deletedAt: new Date(), deletedBy: user.userId });
    await override.save();
    changes.push(change(override, before));
  }
  return changes;
}

/** Deletes an event, one occurrence, or an occurrence and everything after it. */
export async function deleteEvent({ user, id, scope = 'all', occurrenceKey }) {
  const event = await findEditable(user, id);
  const changes = [];

  // An individually edited occurrence: remove it and keep the original date skipped.
  if (event.seriesId && scope !== 'all') {
    const series = await CalendarEvent.findOne({ _id: event.seriesId, tenantId: user.tenantId, deleted: false });
    const before = snapshot(event);
    Object.assign(event, { deleted: true, deletedAt: new Date(), deletedBy: user.userId });
    await event.save();
    changes.push(change(event, before));
    if (series) {
      const seriesBefore = snapshot(series);
      series.exdates = [...new Set([...(series.exdates || []), event.recurrenceKey])];
      await series.save();
      changes.push(change(series, seriesBefore));
    }
    return { changes };
  }

  const isSeries = Boolean(event.recurrence?.freq);
  if (isSeries && scope === 'this') {
    if (!occurrenceKey) throw httpError(422, 'Choose which occurrence to delete.');
    occurrenceAt(event.toObject(), occurrenceKey);
    const before = snapshot(event);
    event.exdates = [...new Set([...(event.exdates || []), occurrenceKey])];
    event.updatedBy = user.userId;
    await event.save();
    return { changes: [change(event, before)] };
  }

  if (isSeries && scope === 'following' && occurrenceKey && occurrenceKey > firstKey(event)) {
    occurrenceAt(event.toObject(), occurrenceKey);
    const before = snapshot(event);
    event.recurrence = { ...plain(event.recurrence), end: { type: 'until', until: dayBefore(occurrenceKey) } };
    event.updatedBy = user.userId;
    await event.save();
    changes.push(change(event, before));
    changes.push(...(await softDeleteOverrides(user, event._id, occurrenceKey)));
    return { changes };
  }

  const before = snapshot(event);
  Object.assign(event, { deleted: true, deletedAt: new Date(), deletedBy: user.userId });
  await event.save();
  changes.push(change(event, before));
  if (isSeries) changes.push(...(await softDeleteOverrides(user, event._id)));
  return { changes };
}

export async function duplicateEvent({ user, id }) {
  if (!canCreate(user)) throw httpError(403, 'You do not have permission to create events.');
  const { event: source } = await getEvent({ user, id });
  const fields = copyFields(source);
  const copy = await CalendarEvent.create({
    ...fields,
    recurrence: source.seriesId ? null : plain(source.recurrence),
    exdates: source.seriesId ? [] : source.exdates || [],
    title: `${source.title} (copy)`.slice(0, 160),
    slug: makeSlug(source.title),
    tenantId: user.tenantId,
    createdBy: user.userId,
  });
  return { event: copy.toObject(), changes: [change(copy, null)] };
}

/** Restores documents to earlier snapshots (undo / redo). `state: null` means deleted. */
export async function revertChanges({ user, changes }) {
  const docs = [];
  for (const { id, state } of changes) {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found');
    const doc = await CalendarEvent.findOne({ _id: id, tenantId: user.tenantId });
    if (!doc) throw httpError(404, 'Event not found');
    if (!canEditEvent(user, doc)) throw httpError(403, 'You do not have permission to change this event.');
    if (state) await checkReferences(user.tenantId, state);
    docs.push({ doc, state });
  }
  for (const { doc, state } of docs) {
    if (state === null) {
      Object.assign(doc, { deleted: true, deletedAt: new Date(), deletedBy: user.userId });
    } else {
      for (const field of EDITABLE_FIELDS) doc.set(field, state[field] ?? undefined);
      doc.deleted = false;
      doc.deletedAt = undefined;
      doc.deletedBy = undefined;
      doc.updatedBy = user.userId;
    }
    await doc.save();
  }
  return { count: docs.length };
}

/**
 * Events that share a resource with the given time slot. Hidden events are reported
 * as "Busy" so private details never leak.
 */
export async function findConflicts({ user, start, end, resourceIds = [], excludeIds = [] }) {
  if (!resourceIds.length || !(start < end)) return [];
  const base = { tenantId: user.tenantId, deleted: false, status: { $nin: ['cancelled', 'draft'] }, resourceIds: { $in: resourceIds } };
  const visible = await accessFilter(user);
  const { occurrences } = await expandRange({ filter: base, start, end, user: { ...user, role: 'superadmin' } });
  const visibleIds = new Set(
    (await CalendarEvent.find({ ...visible, _id: { $in: occurrences.map((o) => o.eventId) } }).distinct('_id')).map(String)
  );
  const exclude = new Set(excludeIds.map(String));
  const wanted = new Set(resourceIds.map(String));
  return occurrences
    .filter((o) => !exclude.has(o.eventId) && !exclude.has(o.seriesId) && !exclude.has(o.id))
    .map((o) => ({
      id: o.id,
      eventId: visibleIds.has(o.eventId) ? o.eventId : null,
      title: visibleIds.has(o.eventId) ? o.title : 'Busy',
      start: o.start,
      end: o.end,
      resourceIds: o.resourceIds.filter((r) => wanted.has(r)),
    }));
}

/* -------------------------------------------------------------------------- */
/*                           Categories and resources                         */
/* -------------------------------------------------------------------------- */

export async function listCategories({ user }) {
  const filter = { tenantId: user.tenantId, deleted: false };
  if (!isAdmin(user)) filter.visibility = { $ne: 'private' };
  return CalendarCategory.find(filter).sort({ order: 1, name: 1 }).lean();
}

export async function saveCategory({ user, id, data }) {
  if (!isAdmin(user)) throw httpError(403, 'Only administrators can manage categories.');
  if (!id) return CalendarCategory.create({ ...data, tenantId: user.tenantId, createdBy: user.userId });
  const category = await CalendarCategory.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, deleted: false },
    { ...data, updatedBy: user.userId },
    { new: true, runValidators: true }
  );
  if (!category) throw httpError(404, 'Category not found');
  return category;
}

export async function deleteCategory({ user, id }) {
  if (!isAdmin(user)) throw httpError(403, 'Only administrators can manage categories.');
  const category = await CalendarCategory.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, deleted: false },
    { deleted: true, deletedAt: new Date() }
  );
  if (!category) throw httpError(404, 'Category not found');
  // Events keep working, uncategorised.
  await CalendarEvent.updateMany({ tenantId: user.tenantId, categoryId: id }, { $unset: { categoryId: 1 } });
}

export async function listResources({ user }) {
  return CalendarResource.find({ tenantId: user.tenantId, deleted: false }).sort({ order: 1, name: 1 }).lean();
}

export async function saveResource({ user, id, data }) {
  if (!isAdmin(user)) throw httpError(403, 'Only administrators can manage resources.');
  if (!id) return CalendarResource.create({ ...data, tenantId: user.tenantId, createdBy: user.userId });
  const resource = await CalendarResource.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, deleted: false },
    data,
    { new: true, runValidators: true }
  );
  if (!resource) throw httpError(404, 'Resource not found');
  return resource;
}

export async function deleteResource({ user, id }) {
  if (!isAdmin(user)) throw httpError(403, 'Only administrators can manage resources.');
  const resource = await CalendarResource.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, deleted: false },
    { deleted: true, deletedAt: new Date() }
  );
  if (!resource) throw httpError(404, 'Resource not found');
  await CalendarEvent.updateMany({ tenantId: user.tenantId, resourceIds: id }, { $pull: { resourceIds: id } });
}

/* -------------------------------------------------------------------------- */
/*                               Import / export                              */
/* -------------------------------------------------------------------------- */

async function exportSource({ user, start, end }) {
  const filter = await accessFilter(user);
  const [singles, series] = await Promise.all([
    CalendarEvent.find({ ...filter, recurrence: null, seriesId: null, start: { $lt: end }, end: { $gt: start } }).lean(),
    CalendarEvent.find({ ...filter, 'recurrence.freq': { $exists: true }, start: { $lt: end } }).lean(),
  ]);
  const activeSeries = series.filter((s) => expandOccurrences(s, start, end).length > 0);
  const overrides = await CalendarEvent.find({
    ...filter,
    $or: [
      { seriesId: { $in: activeSeries.map((s) => s._id) } },
      { seriesId: { $ne: null }, start: { $lt: end }, end: { $gt: start } },
    ],
  }).lean();
  const categories = new Map((await listCategories({ user })).map((c) => [String(c._id), c.name]));
  const tenant = await Tenant.findById(user.tenantId).select('name slug').lean();
  return { events: [...singles, ...activeSeries], overrides, categories, tenant };
}

export async function exportCalendar({ user, start, end, format, appUrl }) {
  const { events, overrides, categories, tenant } = await exportSource({ user, start, end });
  // In CSV, edited occurrences of a series are listed as rows of their own.
  if (format === 'csv') return buildCsv([...events, ...overrides], categories);
  return buildIcs({
    events,
    overrides,
    categories,
    calendarName: `${tenant?.name || 'Workspace'} calendar`,
    uidDomain: `${tenant?.slug || user.tenantId}.calendar`,
    appUrl,
  });
}

/** One event (or one occurrence of a series) as an .ics file — the "Add to calendar" download. */
export async function exportEventIcs({ user, id, occurrenceKey, appUrl }) {
  const { event } = await getEvent({ user, id });
  const tenant = await Tenant.findById(user.tenantId).select('name slug').lean();
  const categories = new Map((await listCategories({ user })).map((c) => [String(c._id), c.name]));
  const uidDomain = `${tenant?.slug || user.tenantId}.calendar`;
  if (occurrenceKey && event.recurrence?.freq) {
    const occ = occurrenceAt(event, occurrenceKey);
    const single = { ...event, _id: `${event._id}-${occurrenceKey}`, start: occ.start, end: occ.end, recurrence: null, exdates: [], externalUid: null };
    return { ics: buildIcs({ events: [single], categories, calendarName: event.title, uidDomain, appUrl }), event };
  }
  const overrides = event.recurrence?.freq
    ? await CalendarEvent.find({ tenantId: user.tenantId, deleted: false, seriesId: event._id }).lean()
    : [];
  return { ics: buildIcs({ events: [event], overrides, categories, calendarName: event.title, uidDomain, appUrl }), event };
}

const MAX_IMPORT = 2000;

/** Imports events from ICS or CSV text. Known UIDs (ICS) and identical title+start (CSV) are skipped. */
export async function importCalendar({ user, text, format, timeZone = 'UTC', validateEvent }) {
  if (!canCreate(user)) throw httpError(403, 'You do not have permission to import events.');
  const parsed = format === 'csv' ? parseCsv(text, { fallbackZone: timeZone }) : parseIcs(text, { fallbackZone: timeZone });
  const warnings = [...parsed.warnings];
  let skipped = parsed.skipped;
  const drafts = parsed.events.slice(0, MAX_IMPORT);
  if (parsed.events.length > MAX_IMPORT) warnings.push(`Only the first ${MAX_IMPORT} events were imported.`);

  const categoriesByName = new Map(
    (await listCategories({ user })).map((c) => [c.name.toLowerCase(), String(c._id)])
  );

  // Duplicate detection
  const uids = drafts.map((d) => d.externalUid).filter(Boolean);
  const knownUids = new Set(
    uids.length ? await CalendarEvent.find({ tenantId: user.tenantId, deleted: false, externalUid: { $in: uids } }).distinct('externalUid') : []
  );
  const existingKeys = new Set();
  if (format === 'csv' && drafts.length) {
    const starts = drafts.map((d) => d.start);
    const existing = await CalendarEvent.find({ tenantId: user.tenantId, deleted: false, start: { $in: starts } }).select('title start').lean();
    for (const e of existing) existingKeys.add(`${e.title.toLowerCase()}|${new Date(e.start).toISOString()}`);
  }

  const toCreate = [];
  let duplicates = 0;
  for (const draft of drafts) {
    if (draft.externalUid && knownUids.has(draft.externalUid)) {
      duplicates++;
      continue;
    }
    const key = `${draft.title.toLowerCase()}|${new Date(draft.start).toISOString()}`;
    if (format === 'csv' && existingKeys.has(key)) {
      duplicates++;
      continue;
    }
    existingKeys.add(key);
    if (draft.externalUid) knownUids.add(draft.externalUid);

    const { categoryName, rrule, ...rest } = draft;
    if (categoryName) {
      const categoryId = categoriesByName.get(categoryName.toLowerCase());
      if (categoryId) rest.categoryId = categoryId;
      else warnings.push(`Unknown category "${categoryName}" — "${draft.title}" was imported without one.`);
    }
    if (rrule) {
      const result = parseRRule(rrule.replace(/^RRULE:/i, ''), rest.start, rest.timeZone, rest.allDay);
      if (result.error) warnings.push(`"${draft.title}": ${result.error}; imported as a single event.`);
      else rest.recurrence = result.recurrence;
    }
    const { value, error } = validateEvent(rest);
    if (error) {
      warnings.push(`"${draft.title}": ${error}`);
      skipped++;
      continue;
    }
    toCreate.push({ ...value, externalUid: draft.externalUid, slug: makeSlug(value.title), tenantId: user.tenantId, createdBy: user.userId });
  }

  const created = toCreate.length ? await CalendarEvent.insertMany(toCreate) : [];

  // Edited occurrences in an ICS file attach to the series they belong to.
  let overridesCreated = 0;
  if (parsed.overrides?.length) {
    const seriesByUid = new Map(
      (await CalendarEvent.find({ tenantId: user.tenantId, deleted: false, externalUid: { $in: parsed.overrides.map((o) => o.externalUid) }, recurrence: { $ne: null } })
        .select('externalUid')
        .lean()).map((s) => [s.externalUid, s._id])
    );
    const overrideDocs = [];
    for (const draft of parsed.overrides) {
      const seriesId = seriesByUid.get(draft.externalUid);
      const { value, error } = validateEvent({ ...draft, recurrenceKey: undefined, externalUid: undefined });
      if (!seriesId || error) continue;
      const exists = await CalendarEvent.exists({ tenantId: user.tenantId, deleted: false, seriesId, recurrenceKey: draft.recurrenceKey });
      if (exists) continue;
      overrideDocs.push({ ...value, seriesId, recurrenceKey: draft.recurrenceKey, slug: makeSlug(value.title), tenantId: user.tenantId, createdBy: user.userId });
    }
    if (overrideDocs.length) overridesCreated = (await CalendarEvent.insertMany(overrideDocs)).length;
  }

  return {
    created: created.length + overridesCreated,
    duplicates,
    skipped,
    warnings: warnings.slice(0, 50),
    changes: created.map((doc) => change(doc, null)),
  };
}
