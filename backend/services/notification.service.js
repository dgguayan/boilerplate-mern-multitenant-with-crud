import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Notification from '../models/Notification.model.js';
import CalendarEvent from '../models/CalendarEvent.model.js';
import CalendarRsvp from '../models/CalendarRsvp.model.js';
import { expandOccurrences } from './calendar/recurrence.js';
import { repliers } from './rsvp.service.js';
import logger from '../utils/logger.js';

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** In-app path that opens the event (and the right occurrence of a series). */
export const eventLink = (rootId, key) =>
  `/calendar?event=${rootId}${key ? `&occurrence=${key}&date=${key}` : ''}`;

/** Readable date of an occurrence in the event's own zone: "Tue, Dec 1 at 10:00 AM". */
function when(event, start) {
  const dt = DateTime.fromJSDate(new Date(start), { zone: event.allDay ? 'utc' : event.timeZone || 'UTC' });
  return event.allDay ? dt.toFormat('ccc, LLL d') : `${dt.toFormat('ccc, LLL d')} at ${dt.toFormat('h:mm a')} (${dt.offsetNameShort})`;
}

/** Start of one occurrence of a series, or null when the date is no longer part of it. */
function occurrenceStart(series, key) {
  const day = DateTime.fromISO(key, { zone: 'utc' });
  if (!day.isValid) return null;
  const occ = expandOccurrences(series, day.minus({ days: 2 }).toJSDate(), day.plus({ days: 3 }).toJSDate()).find((o) => o.key === key);
  return occ?.start ?? null;
}

/**
 * Stores notifications, one per recipient. Duplicates of a dedupeKey are skipped silently.
 * @param {{ userId, type, title, body?, link?, eventId?, occurrenceKey?, dedupeKey? }[]} items
 */
export async function notify(tenantId, items) {
  if (!items.length) return 0;
  try {
    const res = await Notification.insertMany(
      items.map((i) => ({ tenantId, ...i })),
      { ordered: false }
    );
    return res.length;
  } catch (err) {
    if (err?.code === 11000 || err?.writeErrors?.every?.((e) => e.code === 11000)) return err.insertedDocs?.length ?? 0;
    throw err;
  }
}

/** Runs a notification side effect without ever failing the request that caused it. */
export async function quietly(label, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.error(`Notification (${label}) failed: ${err.message}`);
    return null;
  }
}

/* ── Reading ──────────────────────────────────────────── */

export async function listNotifications({ user, limit = 20, before }) {
  const filter = { tenantId: user.tenantId, userId: user.userId };
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const page = await Notification.find({ ...filter, ...(before && { createdAt: { $lt: new Date(before) } }) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(max + 1)
    .lean();
  const unread = await Notification.countDocuments({ ...filter, readAt: null });
  return {
    notifications: page.slice(0, max).map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body || '',
      link: n.link || null,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
    unread,
    hasMore: page.length > max,
  };
}

export async function unreadCount(user) {
  return Notification.countDocuments({ tenantId: user.tenantId, userId: user.userId, readAt: null });
}

/** Marks some (ids) or all of the viewer's notifications read. */
export async function markRead({ user, ids, all }) {
  const filter = { tenantId: user.tenantId, userId: user.userId, readAt: null };
  if (!all) {
    const valid = (ids || []).filter((id) => mongoose.isValidObjectId(id));
    if (!valid.length) return 0;
    filter._id = { $in: valid };
  }
  const res = await Notification.updateMany(filter, { readAt: new Date() });
  return res.modifiedCount;
}

/* ── What happened to an event ────────────────────────── */

const CHANGE_FIELDS = ['start', 'end', 'allDay', 'timeZone', 'location', 'virtualUrl'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Decides whether an edit is worth telling attendees about.
 * @returns {{ type: string, what?: string } | null}
 */
export function describeEdit(data, before) {
  if (data.status && data.status !== before?.status) {
    if (data.status === 'cancelled') return { type: 'event_cancelled' };
    if (data.status === 'postponed') return { type: 'event_postponed' };
  }
  const changed = CHANGE_FIELDS.filter((f) => f in data && (!before || !same(data[f], before[f])));
  if (!changed.length) return null;
  const time = changed.some((f) => ['start', 'end', 'allDay', 'timeZone'].includes(f));
  const place = changed.some((f) => ['location', 'virtualUrl'].includes(f));
  return { type: 'event_changed', what: time && place ? 'time and place' : time ? 'time' : 'place' };
}

/**
 * Tells everyone who replied going / maybe / waitlist about a change.
 * @param {object} p
 * @param p.event     the event document after the change (title, times, zone)
 * @param p.rootId    where answers are stored (single event or series root)
 * @param p.scope     KeyScope: { all: true } | { key } | { from }
 * @param p.change    result of describeEdit, or { type: 'event_deleted' }
 * @param p.actorId   the editor, who is not notified about their own change
 */
export async function noticeEventChange({ tenantId, event, rootId, scope, change, actorId }) {
  const people = await repliers(tenantId, rootId, scope);
  const recipients = people.filter((p) => String(p.userId) !== String(actorId));
  if (!recipients.length) return 0;

  const title = {
    event_changed: `“${event.title}” has a new ${change.what}`,
    event_cancelled: `“${event.title}” was cancelled`,
    event_postponed: `“${event.title}” was postponed`,
    event_deleted: `“${event.title}” was removed`,
  }[change.type];

  const items = recipients.map((p) => {
    const key = p.occurrenceKey;
    const dateText = key ? DateTime.fromISO(key).toFormat('ccc, LLL d') : null;
    // The new start of the person's own occurrence: a series is re-expanded for their date.
    const newStart = event.recurrence?.freq && key ? occurrenceStart(event, key) : event.start;
    const body = {
      event_changed:
        change.what === 'place'
          ? `Check the new location${dateText ? ` for ${dateText}` : ''}.`
          : newStart
            ? `It now starts ${when(event, newStart)}${change.what === 'time and place' ? ', at a new location' : ''}.`
            : `The schedule changed and ${dateText} is no longer part of it.`,
      event_cancelled: `${dateText ? `The ${dateText} session` : 'It'} won’t take place.`,
      event_postponed: 'A new date will be announced.',
      event_deleted: 'The organizer removed it from the calendar.',
    }[change.type];
    return {
      userId: p.userId,
      type: change.type,
      title,
      body,
      link: change.type === 'event_deleted' ? null : eventLink(rootId, key),
      eventId: rootId,
      occurrenceKey: key ?? undefined,
    };
  });
  return notify(tenantId, items);
}

/** Tells people they moved off the waitlist. */
export async function noticePromoted({ tenantId, event, rootId, promoted }) {
  return notify(
    tenantId,
    promoted.map(({ userId, key }) => ({
      userId,
      type: 'waitlist_promoted',
      title: `You got a place at “${event.title}”`,
      body: 'A place freed up and you were next on the waitlist. If you can’t make it, let the organizer know by changing your reply.',
      link: eventLink(rootId, key),
      eventId: rootId,
      occurrenceKey: key ?? undefined,
    }))
  );
}

/* ── Reminders ────────────────────────────────────────── */

/**
 * Sends a reminder to everyone going (or maybe going) to an occurrence that starts within
 * `leadHours`. Each person gets one reminder per occurrence, however often this runs.
 */
export async function sendDueReminders({ now = new Date(), leadHours = 24 } = {}) {
  const horizon = new Date(now.getTime() + leadHours * 3_600_000);
  // Occurrence keys are local dates; a day either side covers every time zone.
  const fromKey = DateTime.fromJSDate(now, { zone: 'utc' }).minus({ days: 1 }).toISODate();
  const toKey = DateTime.fromJSDate(horizon, { zone: 'utc' }).plus({ days: 1 }).toISODate();

  const answers = await CalendarRsvp.find({
    status: { $in: ['going', 'maybe'] },
    $or: [{ occurrenceKey: null }, { occurrenceKey: { $gte: fromKey, $lte: toKey } }],
  })
    .select('tenantId eventId occurrenceKey userId status')
    .lean();
  if (!answers.length) return 0;

  const roots = await CalendarEvent.find({
    _id: { $in: [...new Set(answers.map((a) => String(a.eventId)))] },
    deleted: false,
  }).lean();
  const byId = new Map(roots.map((e) => [String(e._id), e]));
  const overrides = await CalendarEvent.find({ seriesId: { $in: roots.map((r) => r._id) }, deleted: false }).lean();
  const overrideOf = new Map(overrides.map((o) => [`${o.seriesId}|${o.recurrenceKey}`, o]));

  const items = new Map(); // tenantId -> notifications
  for (const a of answers) {
    const root = byId.get(String(a.eventId));
    if (!root) continue;
    let event = root;
    let start = root.start;
    if (a.occurrenceKey) {
      if (!KEY_RE.test(a.occurrenceKey) || !root.recurrence?.freq) continue;
      const override = overrideOf.get(`${root._id}|${a.occurrenceKey}`);
      if (override) {
        event = override;
        start = override.start;
      } else {
        if ((root.exdates || []).includes(a.occurrenceKey)) continue;
        start = occurrenceStart(root, a.occurrenceKey);
        if (!start) continue;
      }
    } else if (root.recurrence?.freq) {
      continue; // answers to a series are always per occurrence
    }
    if (event.status !== 'published') continue;
    const startDate = new Date(start);
    if (!(startDate > now && startDate <= horizon)) continue;

    const list = items.get(String(a.tenantId)) || [];
    list.push({
      userId: a.userId,
      type: 'event_reminder',
      title: `Reminder: “${event.title}” ${relativeStart(startDate, now)}`,
      body: `${when(event, startDate)}${event.location?.name ? ` · ${event.location.name}` : event.virtualUrl ? ' · Online' : ''}${a.status === 'maybe' ? ' · You said maybe' : ''}`,
      link: eventLink(a.eventId, a.occurrenceKey),
      eventId: a.eventId,
      occurrenceKey: a.occurrenceKey ?? undefined,
      dedupeKey: `reminder:${a.eventId}:${a.occurrenceKey ?? ''}:${a.userId}`,
    });
    items.set(String(a.tenantId), list);
  }

  let sent = 0;
  for (const [tenantId, list] of items) sent += await notify(tenantId, list);
  return sent;
}

function relativeStart(start, now) {
  const hours = (start - now) / 3_600_000;
  if (hours < 1) return 'starts in less than an hour';
  if (hours < 2) return 'starts in about an hour';
  if (hours < 20) return `starts in ${Math.round(hours)} hours`;
  return 'starts tomorrow';
}

/** Checks for due reminders every few minutes while the server runs. */
export function startReminderJob({ everyMinutes = 5 } = {}) {
  const run = () => quietly('reminders', () => sendDueReminders());
  run();
  const timer = setInterval(run, everyMinutes * 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
