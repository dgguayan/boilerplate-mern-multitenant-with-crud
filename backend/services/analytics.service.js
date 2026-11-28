import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import CalendarCategory from '../models/CalendarCategory.model.js';
import CalendarResource from '../models/CalendarResource.model.js';
import CalendarEvent from '../models/CalendarEvent.model.js';
import CalendarRsvp from '../models/CalendarRsvp.model.js';
import { accessFilter, expandRange, httpError } from './calendar.service.js';

export const MAX_ANALYTICS_DAYS = 400;
const WORK_START = 9; // resource use is measured against working hours, Mon–Fri 09:00–18:00
const WORK_END = 18;
const ACTIVE = new Set(['published', 'postponed']);

const hoursBetween = (a, b) => Math.max(0, (b - a) / 3_600_000);

/** Hours of [start, end) that fall inside working hours, in the given zone. */
function workingHoursIn(start, end, zone) {
  let total = 0;
  let day = DateTime.fromJSDate(start, { zone }).startOf('day');
  const last = DateTime.fromJSDate(end, { zone });
  while (day < last) {
    if (day.weekday <= 5) {
      const ws = day.set({ hour: WORK_START }).toJSDate();
      const we = day.set({ hour: WORK_END }).toJSDate();
      total += hoursBetween(new Date(Math.max(ws, start)), new Date(Math.min(we, end)));
    }
    day = day.plus({ days: 1 });
  }
  return total;
}

/**
 * Calendar insights for [start, end): how much happened, when, in which categories, how full
 * events got, and how much each room and piece of equipment was used. Counts only what the
 * viewer may see.
 */
export async function getAnalytics({ user, start, end, zone = 'UTC' }) {
  if (!(start < end)) throw httpError(422, 'The range end must be after its start.');
  if ((end - start) / 86_400_000 > MAX_ANALYTICS_DAYS) throw httpError(422, `The range can span at most ${MAX_ANALYTICS_DAYS} days.`);
  if (!DateTime.now().setZone(zone).isValid) throw httpError(422, 'Unknown time zone.');

  const filter = await accessFilter(user);
  const { occurrences, truncated } = await expandRange({ filter, start, end, user });
  const [categories, resources] = await Promise.all([
    CalendarCategory.find({ tenantId: user.tenantId, deleted: false }).select('name color').lean(),
    CalendarResource.find({ tenantId: user.tenantId, deleted: false }).sort({ order: 1, name: 1 }).select('name type exclusive').lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));

  const statusCounts = { published: 0, postponed: 0, cancelled: 0, draft: 0, archived: 0 };
  for (const o of occurrences) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  const active = occurrences.filter((o) => ACTIVE.has(o.status));

  // When: per week (Monday-based, in the viewer's zone) and per weekday.
  const weeks = new Map();
  let cursor = DateTime.fromJSDate(start, { zone }).startOf('week');
  while (cursor.toJSDate() < end) {
    weeks.set(cursor.toISODate(), 0);
    cursor = cursor.plus({ weeks: 1 });
  }
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const byCategory = new Map();
  for (const o of active) {
    const local = o.allDay ? DateTime.fromJSDate(new Date(o.start), { zone: 'utc' }) : DateTime.fromJSDate(new Date(o.start), { zone });
    const week = local.startOf('week').toISODate();
    if (weeks.has(week)) weeks.set(week, weeks.get(week) + 1);
    weekdays[local.weekday - 1] += 1;
    const name = categoryName.get(o.categoryId) || 'Uncategorised';
    byCategory.set(name, (byCategory.get(name) || 0) + 1);
  }

  // Resource use: booked working hours ÷ available working hours.
  const available = workingHoursIn(start, end, zone);
  const booked = new Map(resources.map((r) => [String(r._id), 0]));
  for (const o of active) {
    if (!o.resourceIds?.length || o.allDay) continue;
    const s = new Date(Math.max(new Date(o.start), start));
    const e = new Date(Math.min(new Date(o.end), end));
    const hours = workingHoursIn(s, e, zone);
    for (const id of o.resourceIds) if (booked.has(id)) booked.set(id, booked.get(id) + hours);
  }

  // Replies to the occurrences in range.
  const keyOf = (o) => `${o.seriesId || o.eventId}|${o.isRecurring ? o.recurrenceKey : ''}`;
  const inRange = new Map(active.map((o) => [keyOf(o), o]));
  const roots = [...new Set(active.map((o) => o.seriesId || o.eventId))].map((id) => new mongoose.Types.ObjectId(id));
  const replyRows = roots.length
    ? await CalendarRsvp.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(user.tenantId)), eventId: { $in: roots } } },
        { $group: { _id: { eventId: '$eventId', key: '$occurrenceKey', status: '$status' }, n: { $sum: 1 } } },
      ])
    : [];
  const replies = { going: 0, maybe: 0, declined: 0, waitlist: 0 };
  const perOccurrence = new Map();
  for (const r of replyRows) {
    const key = `${r._id.eventId}|${r._id.key ?? ''}`;
    if (!inRange.has(key)) continue;
    replies[r._id.status] += r.n;
    const counts = perOccurrence.get(key) || { going: 0, maybe: 0, declined: 0, waitlist: 0 };
    counts[r._id.status] += r.n;
    perOccurrence.set(key, counts);
  }

  // How full events with a capacity got.
  const withCapacity = active.filter((o) => o.capacity > 0);
  const fills = withCapacity.map((o) => Math.min(1, (perOccurrence.get(keyOf(o))?.going || 0) / o.capacity));
  const full = withCapacity.filter((o) => (perOccurrence.get(keyOf(o))?.going || 0) >= o.capacity).length;

  const mostReplied = [...perOccurrence]
    .map(([key, counts]) => ({ o: inRange.get(key), counts }))
    .filter((x) => x.counts.going + x.counts.maybe + x.counts.waitlist > 0)
    .sort((a, b) => b.counts.going - a.counts.going || b.counts.waitlist - a.counts.waitlist)
    .slice(0, 5)
    .map(({ o, counts }) => ({
      id: o.id,
      eventId: o.eventId,
      recurrenceKey: o.isRecurring ? o.recurrenceKey : null,
      title: o.title,
      start: o.start,
      allDay: o.allDay,
      capacity: o.capacity,
      ...counts,
    }));

  const eventIds = [...new Set(active.map((o) => o.eventId))];
  const mostViewed = await CalendarEvent.find({ ...filter, _id: { $in: eventIds }, viewCount: { $gt: 0 } })
    .sort({ viewCount: -1 })
    .limit(5)
    .select('title viewCount start allDay')
    .lean();

  return {
    range: { start, end, zone },
    truncated,
    totals: {
      events: active.length,
      cancelled: statusCounts.cancelled,
      postponed: statusCounts.postponed,
      going: replies.going,
      waitlist: replies.waitlist,
      averageFill: fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : null,
      eventsWithCapacity: withCapacity.length,
      fullEvents: full,
    },
    replies,
    perWeek: [...weeks].map(([week, count]) => ({ week, count })),
    perWeekday: weekdays.map((count, i) => ({ weekday: i + 1, count })),
    perCategory: [...byCategory].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    resources: resources.map((r) => {
      const hours = booked.get(String(r._id));
      return {
        id: String(r._id),
        name: r.name,
        type: r.type,
        exclusive: Boolean(r.exclusive),
        bookedHours: Math.round(hours * 10) / 10,
        availableHours: Math.round(available * 10) / 10,
        utilization: available ? Math.min(1, hours / available) : 0,
      };
    }),
    mostReplied,
    mostViewed: mostViewed.map((e) => ({ id: String(e._id), title: e.title, views: e.viewCount })),
  };
}
