import * as calendar from '../services/calendar.service.js';
import * as rsvp from '../services/rsvp.service.js';
import * as notifications from '../services/notification.service.js';
import * as sharing from '../services/public.service.js';
import * as apiResponse from '../utils/apiResponse.js';
import { audit } from '../utils/audit.js';
import {
  importQuerySchema,
  rangeQuerySchema,
  validateImportedEvent,
} from '../validators/calendar.validators.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const validQuery = (schema, query) => {
  const { value, error } = schema.validate(query, { stripUnknown: true });
  if (error) throw Object.assign(new Error(error.details[0].message.replace(/"/g, "'")), { status: 422 });
  return value;
};

const appUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '') || null;

const SCOPE_TEXT = { this: ' (this occurrence)', following: ' (this and following)', all: '' };
const logCalendar = (req, action, summary, target, metadata) =>
  audit(req, { action: `calendar.${action}`, category: 'calendar', summary, target, metadata });
const eventTarget = (event) => event && { type: 'event', id: event._id || event.id, label: event.title };

const safeFileName =(name) => name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'calendar';

/** Conflicts for events booked on resources, reported alongside a change (never blocking). */
async function conflictsFor(user, event) {
  if (!event?.resourceIds?.length || event.recurrence?.freq || ['cancelled', 'draft'].includes(event.status)) return [];
  return calendar.findConflicts({
    user,
    start: new Date(event.start),
    end: new Date(event.end),
    resourceIds: event.resourceIds.map(String),
    excludeIds: [String(event._id)],
  });
}

export const occurrences = handle(async (req, res) => {
  const { start, end } = validQuery(rangeQuerySchema, req.query);
  const result = await calendar.getOccurrences({ user: req.user, start, end });
  // The viewer's own answer on each occurrence, for the "Going" marker and the "My RSVPs" filter.
  const answers = await rsvp.myAnswers(req.user, result.occurrences);
  for (const occ of result.occurrences) occ.myRsvp = answers.get(rsvp.answerKey(occ)) ?? null;
  return apiResponse.success(res, result);
});

export const getEvent = handle(async (req, res) => {
  const result = await calendar.getEvent({ user: req.user, id: req.params.id, countView: req.query.view === '1' });
  return apiResponse.success(res, result);
});

export const createEvent = handle(async (req, res) => {
  const result = await calendar.createEvent({ user: req.user, data: req.body });
  logCalendar(req, 'event_created', `Created event “${result.event.title}”`, eventTarget(result.event));
  return apiResponse.created(res, { ...result, conflicts: await conflictsFor(req.user, result.event) }, 'Event created');
});

/**
 * Where an edit's replies live and which occurrences it touched. A "this and following" split
 * moves later replies onto the new series first, so nobody's answer is lost.
 */
async function repliesTouchedByEdit(req, result, scope, occurrenceKey) {
  const ev = result.event;
  if (ev.seriesId) return { rootId: ev.seriesId, keys: { key: ev.recurrenceKey } };
  if (scope === 'following' && String(ev._id) !== req.params.id) {
    await rsvp.moveAnswers(req.user.tenantId, req.params.id, ev._id, occurrenceKey);
  }
  return { rootId: ev._id, keys: { all: true } };
}

export const updateEvent = handle(async (req, res) => {
  const { scope, occurrenceKey, data } = req.body;
  const result = await calendar.updateEvent({ user: req.user, id: req.params.id, scope, occurrenceKey, data });
  const { rootId, keys } = await repliesTouchedByEdit(req, result, scope, occurrenceKey);
  const change = notifications.describeEdit(data, result.changes[0]?.before);
  if (change) {
    await notifications.quietly('event change', () =>
      notifications.noticeEventChange({ tenantId: req.user.tenantId, event: result.event, rootId, scope: keys, change, actorId: req.user.userId })
    );
  }
  // More places (or none) may let people off the waitlist.
  if ('capacity' in data) {
    const promoted = await rsvp.rebalanceEvent(req.user, rootId, keys);
    if (promoted.length) {
      await notifications.quietly('waitlist', () =>
        notifications.noticePromoted({ tenantId: req.user.tenantId, event: result.event, rootId, promoted })
      );
    }
  }
  logCalendar(req, 'event_updated', `Updated event “${result.event.title}”${SCOPE_TEXT[scope] || ''}`, eventTarget(result.event), {
    scope,
    occurrence: occurrenceKey,
    fields: Object.keys(data),
  });
  return apiResponse.success(res, { ...result, conflicts: await conflictsFor(req.user, result.event) }, 'Event updated');
});

export const deleteEvent = handle(async (req, res) => {
  const scope = ['this', 'following', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
  const occurrenceKey = /^\d{4}-\d{2}-\d{2}$/.test(req.query.occurrence || '') ? req.query.occurrence : undefined;
  const before = await calendar.peekEvent(req.user, req.params.id);
  const result = await calendar.deleteEvent({ user: req.user, id: req.params.id, scope, occurrenceKey });
  if (before) {
    // An edited occurrence answers for its own date; a series for the dates the scope covers.
    const touched = before.seriesId
      ? { rootId: before.seriesId, keys: { key: before.recurrenceKey } }
      : before.recurrence?.freq && scope === 'this' && occurrenceKey
            ? { rootId: before._id, keys: { key: occurrenceKey } }
            : before.recurrence?.freq && scope === 'following' && occurrenceKey
              ? { rootId: before._id, keys: { from: occurrenceKey } }
              : { rootId: before._id, keys: { all: true } };
    await notifications.quietly('event deleted', () =>
      notifications.noticeEventChange({
        tenantId: req.user.tenantId,
        event: before,
        rootId: touched.rootId,
        scope: touched.keys,
        change: { type: 'event_deleted' },
        actorId: req.user.userId,
      })
    );
  }
  const title = result.changes[0]?.before?.title || 'event';
  logCalendar(req, 'event_deleted', `Deleted event “${title}”${SCOPE_TEXT[scope] || ''}`, { type: 'event', id: req.params.id, label: title }, { scope, occurrence: occurrenceKey });
  return apiResponse.success(res, result, 'Event deleted');
});

export const duplicateEvent = handle(async (req, res) => {
  const result = await calendar.duplicateEvent({ user: req.user, id: req.params.id });
  logCalendar(req, 'event_duplicated', `Duplicated an event as “${result.event.title}”`, eventTarget(result.event));
  return apiResponse.created(res, result, 'Event duplicated');
});

export const revert = handle(async (req, res) => {
  const result = await calendar.revertChanges({ user: req.user, changes: req.body.changes });
  const titles = [...new Set(req.body.changes.map((c) => c.state?.title).filter(Boolean))].slice(0, 3);
  logCalendar(req, 'changes_reverted', `Undid or redid ${result.count} event change${result.count === 1 ? '' : 's'}${titles.length ? ` (${titles.join(', ')})` : ''}`, null, {
    eventIds: req.body.changes.map((c) => c.id).slice(0, 50),
  });
  return apiResponse.success(res, result, 'Changes restored');
});

export const conflicts = handle(async (req, res) => {
  const { start, end, resourceIds, excludeIds } = req.body;
  const list = await calendar.findConflicts({ user: req.user, start, end, resourceIds, excludeIds });
  return apiResponse.success(res, { conflicts: list });
});

export const eventIcs = handle(async (req, res) => {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(req.query.occurrence || '') ? req.query.occurrence : undefined;
  const { ics, event } = await calendar.exportEventIcs({ user: req.user, id: req.params.id, occurrenceKey: key, appUrl: appUrl() });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(event.title)}.ics"`);
  res.send(ics);
});

export const exportCalendar = handle(async (req, res) => {
  const { start, end, format } = validQuery(rangeQuerySchema, req.query);
  if ((end - start) / 86_400_000 > 3 * 366) {
    throw Object.assign(new Error('Exports can cover at most three years.'), { status: 422 });
  }
  const body = await calendar.exportCalendar({ user: req.user, start, end, format, appUrl: appUrl() });
  logCalendar(req, 'exported', `Exported calendar events as ${format.toUpperCase()}`, null, { start, end, format });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="calendar-${stamp}.${format}"`);
  res.send(body);
});

export const importCalendar = handle(async (req, res) => {
  const { format, timeZone } = validQuery(importQuerySchema, req.query);
  if (typeof req.body !== 'string' || !req.body.trim()) {
    throw Object.assign(new Error('Upload an .ics or .csv file.'), { status: 422 });
  }
  if (format === 'ics' && !req.body.includes('BEGIN:VCALENDAR')) {
    throw Object.assign(new Error('This is not an iCalendar (.ics) file.'), { status: 422 });
  }
  const result = await calendar.importCalendar({
    user: req.user,
    text: req.body,
    format,
    timeZone,
    validateEvent: validateImportedEvent,
  });
  logCalendar(req, 'imported', `Imported ${result.created} event${result.created === 1 ? '' : 's'} from ${format.toUpperCase()}`, null, {
    format,
    created: result.created,
    duplicates: result.duplicates,
    skipped: result.skipped,
  });
  return apiResponse.success(res, result, 'Import finished');
});

export const listCategories = handle(async (req, res) =>
  apiResponse.success(res, { categories: await calendar.listCategories({ user: req.user }) })
);
export const saveCategory = handle(async (req, res) => {
  const category = await calendar.saveCategory({ user: req.user, id: req.params.id, data: req.body });
  logCalendar(req, req.params.id ? 'category_updated' : 'category_created', `${req.params.id ? 'Updated' : 'Created'} category “${category.name}”`, {
    type: 'category',
    id: category._id,
    label: category.name,
  });
  return req.params.id ? apiResponse.success(res, { category }) : apiResponse.created(res, { category });
});
export const deleteCategory = handle(async (req, res) => {
  await calendar.deleteCategory({ user: req.user, id: req.params.id });
  logCalendar(req, 'category_deleted', 'Deleted a category', { type: 'category', id: req.params.id });
  return apiResponse.success(res, {}, 'Category deleted');
});

export const listResources = handle(async (req, res) =>
  apiResponse.success(res, { resources: await calendar.listResources({ user: req.user }) })
);
export const saveResource = handle(async (req, res) => {
  const resource = await calendar.saveResource({ user: req.user, id: req.params.id, data: req.body });
  logCalendar(req, req.params.id ? 'resource_updated' : 'resource_created', `${req.params.id ? 'Updated' : 'Created'} resource “${resource.name}”`, {
    type: 'resource',
    id: resource._id,
    label: resource.name,
  });
  return req.params.id ? apiResponse.success(res, { resource }) : apiResponse.created(res, { resource });
});
export const deleteResource = handle(async (req, res) => {
  await calendar.deleteResource({ user: req.user, id: req.params.id });
  logCalendar(req, 'resource_deleted', 'Deleted a resource', { type: 'resource', id: req.params.id });
  return apiResponse.success(res, {}, 'Resource deleted');
});

/* ── RSVP ─────────────────────────────────────────────── */

const occurrenceParam = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : undefined);
const RSVP_WORDS = { going: 'is going to', maybe: 'might go to', declined: "can't go to", waitlist: 'joined the waitlist for' };

export const getRsvp = handle(async (req, res) => {
  const summary = await rsvp.getRsvpSummary({ user: req.user, id: req.params.id, occurrenceKey: occurrenceParam(req.query.occurrence) });
  return apiResponse.success(res, summary);
});

export const setRsvp = handle(async (req, res) => {
  const { status, note, occurrence } = req.body;
  const result = await rsvp.setRsvp({ user: req.user, id: req.params.id, occurrenceKey: occurrence, status, note });
  const stored = result.summary.mine?.status;
  logCalendar(req, 'rsvp', `Replied: ${RSVP_WORDS[stored] || stored} “${result.target.event.title}”`, eventTarget(result.target.event), {
    status: stored,
    occurrence: result.target.key,
    previous: result.previous,
    promoted: result.promoted.length || undefined,
  });
  if (result.promoted.length) {
    await notifications.quietly('waitlist', () =>
      notifications.noticePromoted({
        tenantId: req.user.tenantId,
        event: result.target.event,
        rootId: result.target.rootId,
        promoted: result.promoted.map((userId) => ({ userId, key: result.target.key })),
      })
    );
  }
  return apiResponse.success(res, result.summary, stored === 'waitlist' ? 'The event is full — you are on the waitlist' : 'Reply saved');
});

export const listAttendees = handle(async (req, res) => {
  const result = await rsvp.listAttendees({ user: req.user, id: req.params.id, occurrenceKey: occurrenceParam(req.query.occurrence) });
  return apiResponse.success(res, result);
});

/* ── Public calendar sharing ──────────────────────────── */

export const getSharing = handle(async (req, res) => apiResponse.success(res, await sharing.getSharing(req.user)));

export const setSharing = handle(async (req, res) => {
  const result = await sharing.setSharing(req.user, req.body);
  logCalendar(req, 'sharing_changed', result.publicEnabled ? 'Turned the public calendar on' : 'Turned the public calendar off', null, {
    publicEnabled: result.publicEnabled,
  });
  return apiResponse.success(res, result, result.publicEnabled ? 'The public calendar is on' : 'The public calendar is off');
});
