import mongoose from 'mongoose';
import CalendarEvent from '../models/CalendarEvent.model.js';
import CalendarRsvp from '../models/CalendarRsvp.model.js';
import { accessFilter, canEditEvent, httpError, occurrenceAt } from './calendar.service.js';

/*
 * RSVP rules
 *  - Only published events that have not started, before their registration deadline, take
 *    "going" or "maybe". "Can't go" is accepted until the event ends.
 *  - With a capacity, only "going" uses a place. Saying "going" to a full event joins the
 *    waitlist; when a place frees up, the longest-waiting person gets it.
 *  - For a recurring event every occurrence has its own answers and its own places.
 */

const ANSWERS = ['going', 'maybe', 'declined'];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Finds what an answer is about: the event document that describes the occurrence (an edited
 * occurrence has its own), and where answers are stored (series root + occurrence date).
 */
export async function resolveTarget(user, id, occurrenceKey) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found');
  const filter = await accessFilter(user);
  const event = await CalendarEvent.findOne({ ...filter, _id: id }).lean();
  if (!event) throw httpError(404, 'Event not found');

  // An edited occurrence: answers live on its series, under its date.
  if (event.seriesId) {
    return { event, rootId: event.seriesId, key: event.recurrenceKey, start: event.start, end: event.end };
  }

  if (event.recurrence?.freq) {
    if (!occurrenceKey || !KEY_RE.test(occurrenceKey)) throw httpError(422, 'Choose which occurrence you are answering for.');
    if ((event.exdates || []).includes(occurrenceKey)) throw httpError(404, 'That occurrence was removed from the series.');
    const override = await CalendarEvent.findOne({ ...filter, seriesId: event._id, recurrenceKey: occurrenceKey }).lean();
    if (override) return { event: override, rootId: event._id, key: occurrenceKey, start: override.start, end: override.end };
    const occ = occurrenceAt(event, occurrenceKey);
    return { event, rootId: event._id, key: occurrenceKey, start: occ.start, end: occ.end };
  }

  return { event, rootId: event._id, key: null, start: event.start, end: event.end };
}

/** Whether new "going"/"maybe" answers are accepted, and if not, why (in words a person reads). */
export function registrationState(target, now = new Date()) {
  const { event, start, end } = target;
  if (event.status === 'cancelled') return { open: false, reason: 'This event was cancelled.' };
  if (event.status === 'postponed') return { open: false, reason: 'This event was postponed.' };
  if (event.status !== 'published') return { open: false, reason: 'This event is not open for replies.' };
  if (new Date(end) <= now) return { open: false, reason: 'This event has ended.' };
  if (new Date(start) <= now) return { open: false, reason: 'This event has already started.' };
  if (event.registrationDeadline && new Date(event.registrationDeadline) < now) {
    return { open: false, reason: 'Registration closed at the deadline.' };
  }
  return { open: true, reason: null };
}

const where = (user, target) => ({ tenantId: user.tenantId, eventId: target.rootId, occurrenceKey: target.key });

/**
 * Gives free places to the waitlist, longest-waiting first, and takes them back from anyone
 * past capacity (two people can take the last place at the same moment). Returns the ids of
 * people who moved from the waitlist to going.
 */
async function rebalance(user, target) {
  const capacity = target.event.capacity;
  if (capacity == null) return [];
  const scope = where(user, target);
  const going = await CalendarRsvp.find({ ...scope, status: 'going' }).sort({ queuedAt: 1, _id: 1 }).select('_id').lean();
  if (going.length > capacity) {
    const overflow = going.slice(capacity).map((r) => r._id);
    await CalendarRsvp.updateMany({ _id: { $in: overflow } }, { status: 'waitlist' });
    return [];
  }
  const free = capacity - going.length;
  if (free <= 0) return [];
  const next = await CalendarRsvp.find({ ...scope, status: 'waitlist' }).sort({ queuedAt: 1, _id: 1 }).limit(free).lean();
  if (!next.length) return [];
  await CalendarRsvp.updateMany({ _id: { $in: next.map((r) => r._id) } }, { status: 'going' });
  return next.map((r) => String(r.userId));
}

async function countsFor(user, target) {
  const rows = await CalendarRsvp.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(String(user.tenantId)), eventId: new mongoose.Types.ObjectId(String(target.rootId)), occurrenceKey: target.key } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const counts = { going: 0, maybe: 0, declined: 0, waitlist: 0 };
  for (const r of rows) counts[r._id] = r.n;
  return counts;
}

/** The answer summary shown on an event: counts, places left, and the viewer's own answer. */
export async function getRsvpSummary({ user, id, occurrenceKey }) {
  const target = await resolveTarget(user, id, occurrenceKey);
  return summarize(user, target);
}

async function summarize(user, target) {
  const [counts, mine] = await Promise.all([
    countsFor(user, target),
    CalendarRsvp.findOne({ ...where(user, target), userId: user.userId }).lean(),
  ]);
  const capacity = target.event.capacity ?? null;
  let waitlistPosition = null;
  if (mine?.status === 'waitlist') {
    waitlistPosition =
      (await CalendarRsvp.countDocuments({
        ...where(user, target),
        status: 'waitlist',
        $or: [{ queuedAt: { $lt: mine.queuedAt } }, { queuedAt: mine.queuedAt, _id: { $lt: mine._id } }],
      })) + 1;
  }
  return {
    eventId: String(target.rootId),
    occurrenceKey: target.key,
    capacity,
    spotsLeft: capacity == null ? null : Math.max(0, capacity - counts.going),
    counts,
    mine: mine ? { status: mine.status, note: mine.note || '', waitlistPosition, updatedAt: mine.updatedAt } : null,
    ...registrationState(target),
    canSeeAttendees: canEditEvent(user, target.event),
  };
}

/**
 * Saves the viewer's answer. "going" to a full event becomes "waitlist".
 * @returns {{ summary, promoted: string[], target }}  promoted: users who left the waitlist
 */
export async function setRsvp({ user, id, occurrenceKey, status, note }) {
  if (!ANSWERS.includes(status)) throw httpError(422, 'Answer going, maybe or declined.');
  const target = await resolveTarget(user, id, occurrenceKey);
  const state = registrationState(target);
  if (status !== 'declined' && !state.open) throw httpError(409, state.reason);
  if (status === 'declined' && new Date(target.end) <= new Date()) throw httpError(409, 'This event has ended.');

  const scope = where(user, target);
  const existing = await CalendarRsvp.findOne({ ...scope, userId: user.userId }).lean();
  let stored = status;
  // Someone who already holds a place (or a waitlist spot) keeps it and its queue time.
  const keepsQueue = status === 'going' && ['going', 'waitlist'].includes(existing?.status);
  if (status === 'going' && target.event.capacity != null && existing?.status !== 'going') {
    const taken = await CalendarRsvp.countDocuments({ ...scope, status: 'going' });
    if (taken >= target.event.capacity) stored = 'waitlist';
  }

  await CalendarRsvp.updateOne(
    { ...scope, userId: user.userId },
    {
      $set: { status: keepsQueue ? existing.status : stored, note: note ?? existing?.note ?? '' },
      ...(!keepsQueue && { $currentDate: { queuedAt: true } }),
      $setOnInsert: { tenantId: user.tenantId, eventId: target.rootId, occurrenceKey: target.key, userId: user.userId },
    },
    { upsert: true }
  );

  const promoted = await rebalance(user, target);
  return { summary: await summarize(user, target), promoted, target, previous: existing?.status ?? null };
}

/** Everyone who answered, for the event's editors. */
export async function listAttendees({ user, id, occurrenceKey }) {
  const target = await resolveTarget(user, id, occurrenceKey);
  if (!canEditEvent(user, target.event)) throw httpError(403, 'Only the event’s organizers can see who replied.');
  const rows = await CalendarRsvp.find(where(user, target))
    .sort({ status: 1, queuedAt: 1 })
    .populate('userId', 'name email')
    .lean();
  const order = { going: 0, waitlist: 1, maybe: 2, declined: 3 };
  return {
    eventId: String(target.rootId),
    occurrenceKey: target.key,
    capacity: target.event.capacity ?? null,
    attendees: rows
      .filter((r) => r.userId)
      .sort((a, b) => order[a.status] - order[b.status] || new Date(a.queuedAt) - new Date(b.queuedAt))
      .map((r) => ({
        userId: String(r.userId._id),
        name: r.userId.name,
        email: r.userId.email,
        status: r.status,
        note: r.note || '',
        respondedAt: r.updatedAt,
      })),
  };
}

/**
 * The viewer's answers for a set of occurrences, keyed "<rootId>|<occurrenceKey>".
 * @param {{ eventId: string, seriesId: string|null, recurrenceKey: string|null }[]} occurrences
 */
export async function myAnswers(user, occurrences) {
  const ids = [...new Set(occurrences.map((o) => o.seriesId || o.eventId))];
  if (!ids.length) return new Map();
  const rows = await CalendarRsvp.find({ tenantId: user.tenantId, userId: user.userId, eventId: { $in: ids } })
    .select('eventId occurrenceKey status')
    .lean();
  return new Map(rows.map((r) => [`${r.eventId}|${r.occurrenceKey ?? ''}`, r.status]));
}

export const answerKey = (occ) => `${occ.seriesId || occ.eventId}|${occ.recurrenceKey ?? ''}`;

/* ── Helpers for notifications and event edits ───────────── */

/**
 * Which occurrences of an event an edit or a notice is about.
 * @typedef {{ all: true } | { key: string|null } | { from: string }} KeyScope
 */
const keyMatch = (scope) =>
  scope.all ? {} : scope.from ? { occurrenceKey: { $gte: scope.from } } : { occurrenceKey: scope.key ?? null };

/** People who said going, maybe or joined the waitlist — the ones an event change affects. */
export async function repliers(tenantId, rootId, scope) {
  return CalendarRsvp.find({ tenantId, eventId: rootId, status: { $in: ['going', 'maybe', 'waitlist'] }, ...keyMatch(scope) })
    .select('userId occurrenceKey status')
    .lean();
}

/** When "this and following" splits a series, later answers move to the new series. */
export async function moveAnswers(tenantId, fromRootId, toRootId, fromKey) {
  const res = await CalendarRsvp.updateMany(
    { tenantId, eventId: fromRootId, occurrenceKey: { $gte: fromKey } },
    { eventId: toRootId }
  );
  return res.modifiedCount;
}

/**
 * Re-applies capacity to every occurrence with a waitlist (after capacity was raised, say).
 * @returns {Promise<{ userId: string, key: string|null }[]>} people who got a place
 */
export async function rebalanceEvent(user, rootId, scope) {
  const keys = await CalendarRsvp.distinct('occurrenceKey', { tenantId: user.tenantId, eventId: rootId, status: 'waitlist', ...keyMatch(scope) });
  const promoted = [];
  for (const key of keys) {
    let target;
    try {
      target = await resolveTarget(user, String(rootId), key ?? undefined);
    } catch {
      continue; // the occurrence no longer exists
    }
    if (registrationState(target).open === false && new Date(target.start) <= new Date()) continue;
    for (const userId of await rebalance(user, target)) promoted.push({ userId, key });
  }
  return promoted;
}
