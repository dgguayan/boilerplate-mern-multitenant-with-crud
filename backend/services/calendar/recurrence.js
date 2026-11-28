import { DateTime } from 'luxon';

/**
 * Recurrence expansion.
 *
 * Rules are evaluated on local wall-clock dates in the event's own time zone and each
 * occurrence is then converted back to an instant. That keeps a "09:00 every Monday" meeting
 * at 09:00 local time on both sides of a daylight-saving change.
 *
 * All-day events are floating dates: they are expanded in UTC, where start/end are stored.
 */

const MAX_ITERATIONS = 50_000;

export const toDateKey = (dt) => dt.toISODate();

/** Local DateTime of an event's start, in the zone its rule is evaluated in. */
export function localStart(event) {
  return DateTime.fromJSDate(new Date(event.start), { zone: event.allDay ? 'utc' : event.timeZone });
}

/** The candidate local dates of a rule, in order, starting at the series start. */
function* candidateDates(rule, first) {
  const interval = Math.max(1, rule.interval || 1);
  const startDay = first.startOf('day');

  if (rule.freq === 'daily') {
    for (let k = 0; ; k++) yield startDay.plus({ days: k * interval });
  }

  if (rule.freq === 'weekly') {
    const weekdays = [...new Set(rule.byWeekday?.length ? rule.byWeekday : [first.weekday])].sort((a, b) => a - b);
    const weekStart = startDay.minus({ days: first.weekday - 1 }); // ISO week, Monday
    for (let w = 0; ; w++) {
      const base = weekStart.plus({ weeks: w * interval });
      for (const weekday of weekdays) {
        const date = base.plus({ days: weekday - 1 });
        if (date >= startDay) yield date;
      }
    }
  }

  if (rule.freq === 'monthly') {
    const nth = Math.ceil(first.day / 7);
    const isLast = first.plus({ weeks: 1 }).month !== first.month;
    for (let k = 0; ; k++) {
      const month = startDay.startOf('month').plus({ months: k * interval });
      if (rule.monthlyMode === 'nthWeekday') {
        yield nthWeekdayOfMonth(month, first.weekday, isLast && nth >= 4 ? -1 : nth);
      } else if (first.day <= month.daysInMonth) {
        yield month.set({ day: first.day }); // months without that day are skipped (RFC 5545)
      }
    }
  }

  if (rule.freq === 'yearly') {
    for (let k = 0; ; k++) {
      const year = startDay.year + k * interval;
      const date = DateTime.fromObject({ year, month: first.month, day: first.day }, { zone: first.zone });
      if (date.isValid && date.month === first.month) yield date; // Feb 29 only in leap years
    }
  }
}

function nthWeekdayOfMonth(month, weekday, nth) {
  if (nth === -1) {
    const last = month.endOf('month').startOf('day');
    return last.minus({ days: (last.weekday - weekday + 7) % 7 });
  }
  const firstOfMonth = month.startOf('month');
  const offset = (weekday - firstOfMonth.weekday + 7) % 7;
  const date = firstOfMonth.plus({ days: offset + (nth - 1) * 7 });
  return date.month === month.month ? date : null;
}

/**
 * Expands an event into the occurrences that overlap [rangeStart, rangeEnd).
 * @param {object} event       a CalendarEvent (lean)
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {Set<string>} [skipKeys] occurrence keys replaced by edited single occurrences
 * @returns {{ key: string|null, start: Date, end: Date }[]}
 */
export function expandOccurrences(event, rangeStart, rangeEnd, skipKeys = new Set()) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const duration = end - start;

  if (!event.recurrence?.freq) {
    return start < rangeEnd && end > rangeStart ? [{ key: null, start, end }] : [];
  }

  const rule = event.recurrence;
  const first = localStart(event);
  const exdates = new Set(event.exdates || []);
  const until = rule.end?.type === 'until' && rule.end.until ? rule.end.until : null;
  const maxCount = rule.end?.type === 'count' ? rule.end.count : Infinity;
  const allDayDays = event.allDay ? Math.max(1, Math.round(duration / 86_400_000)) : 0;

  const results = [];
  let produced = 0;
  let iterations = 0;
  for (const date of candidateDates(rule, first)) {
    if (++iterations > MAX_ITERATIONS) break;
    if (!date) continue; // e.g. no 5th Tuesday this month
    const key = toDateKey(date);
    if (until && key > until) break;
    if (produced >= maxCount) break;
    produced++; // COUNT includes skipped dates, as in RFC 5545

    const occStart = date.set({ hour: first.hour, minute: first.minute, second: first.second, millisecond: 0 });
    const occStartDate = occStart.toJSDate();
    if (occStartDate >= rangeEnd) break;

    const occEndDate = event.allDay
      ? occStart.plus({ days: allDayDays }).toJSDate()
      : new Date(occStartDate.getTime() + duration);

    if (occEndDate > rangeStart && !exdates.has(key) && !skipKeys.has(key)) {
      results.push({ key, start: occStartDate, end: occEndDate });
    }
  }
  return results;
}

/** Number of occurrences generated before the given key (for splitting COUNT-limited series). */
export function countBefore(event, key) {
  if (!event.recurrence?.freq) return 0;
  let count = 0;
  let iterations = 0;
  for (const date of candidateDates(event.recurrence, localStart(event))) {
    if (++iterations > MAX_ITERATIONS) break;
    if (!date) continue;
    if (toDateKey(date) >= key) break;
    count++;
  }
  return count;
}

/** The local date key of an occurrence instant for this event. */
export function keyForInstant(event, instant) {
  return toDateKey(DateTime.fromJSDate(new Date(instant), { zone: event.allDay ? 'utc' : event.timeZone }));
}

/** The first occurrence key of a series (its start date in the event's zone). */
export function firstKey(event) {
  return toDateKey(localStart(event));
}

/** Last possible occurrence date of a series, as a key, or null when it never ends. */
export function seriesEndKey(event) {
  const rule = event.recurrence;
  if (!rule?.freq) return null;
  if (rule.end?.type === 'until') return rule.end.until;
  if (rule.end?.type === 'count') {
    let last = null;
    let produced = 0;
    let iterations = 0;
    for (const date of candidateDates(rule, localStart(event))) {
      if (++iterations > MAX_ITERATIONS) break;
      if (!date) continue;
      last = toDateKey(date);
      if (++produced >= rule.end.count) break;
    }
    return last;
  }
  return null;
}

const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** RFC 5545 RRULE value for a rule (UNTIL as UTC end of that local day). */
export function toRRule(event) {
  const rule = event.recurrence;
  if (!rule?.freq) return null;
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  const first = localStart(event);
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday?.length ? rule.byWeekday : [first.weekday];
    parts.push(`BYDAY=${[...new Set(days)].sort().map((d) => ICS_DAYS[d - 1]).join(',')}`);
  }
  if (rule.freq === 'monthly' && rule.monthlyMode === 'nthWeekday') {
    const nth = Math.ceil(first.day / 7);
    const isLast = first.plus({ weeks: 1 }).month !== first.month && nth >= 4;
    parts.push(`BYDAY=${isLast ? -1 : nth}${ICS_DAYS[first.weekday - 1]}`);
  }
  if (rule.end?.type === 'count') parts.push(`COUNT=${rule.end.count}`);
  if (rule.end?.type === 'until' && rule.end.until) {
    if (event.allDay) {
      parts.push(`UNTIL=${rule.end.until.replace(/-/g, '')}`);
    } else {
      const untilUtc = DateTime.fromISO(rule.end.until, { zone: event.timeZone }).endOf('day').toUTC();
      parts.push(`UNTIL=${untilUtc.toFormat("yyyyMMdd'T'HHmmss'Z'")}`);
    }
  }
  return parts.join(';');
}

export { ICS_DAYS };
