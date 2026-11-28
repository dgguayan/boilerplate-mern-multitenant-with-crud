import { DateTime, Info } from "luxon"

export const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

/** Longest range the occurrences API accepts in one request (matches the backend). */
export const MAX_RANGE_DAYS = 400

let zonesCache = null
/** All IANA time zones the browser knows, with the browser zone first. */
export function timeZones() {
  if (!zonesCache) {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [BROWSER_ZONE, "UTC"]
    zonesCache = [...new Set([BROWSER_ZONE, "UTC", ...list])]
  }
  return zonesCache
}

export function zoneLabel(zone, at = DateTime.now()) {
  const offset = at.setZone(zone).toFormat("ZZ")
  return `${zone.replace(/_/g, " ")} (UTC${offset})`
}

/** Luxon weekday (1 = Mon … 7 = Sun) ⇄ FullCalendar / JS day (0 = Sun … 6 = Sat). */
export const toJsDay = (isoDay) => isoDay % 7
export const toIsoDay = (jsDay) => (jsDay === 0 ? 7 : jsDay)

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  iso: d,
  short: Info.weekdays("short")[d - 1],
  long: Info.weekdays("long")[d - 1],
  narrow: Info.weekdays("narrow")[d - 1],
}))

export const fromISO = (value, zone) => DateTime.fromISO(value, { zone })
export const fromJS = (value, zone) => DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone })

/** Start of the week containing `dt` for a configurable first day (ISO weekday). */
export function startOfWeek(dt, firstDay = 1) {
  const diff = (dt.weekday - firstDay + 7) % 7
  return dt.startOf("day").minus({ days: diff })
}

/** ISO week number (shown when week numbers are enabled). */
export const weekNumber = (dt) => dt.weekNumber

/**
 * The date range a view needs data for, in the display zone. The fetch range is padded so
 * month grids (which show leading/trailing days) and timezone shifts are covered.
 */
export function rangeForView(view, date, prefs) {
  const d = date.startOf("day")
  switch (view) {
    case "year":
      return { start: d.startOf("year"), end: d.endOf("year").plus({ days: 1 }).startOf("day") }
    case "multiMonth":
      return { start: d.startOf("month"), end: d.startOf("month").plus({ months: 3 }) }
    case "month": {
      const start = startOfWeek(d.startOf("month"), prefs.firstDay)
      return { start, end: start.plus({ weeks: 6 }) }
    }
    case "week":
    case "workWeek":
    case "timeline": {
      const start = startOfWeek(d, prefs.firstDay)
      return { start, end: start.plus({ weeks: 1 }) }
    }
    case "day":
    case "resources":
      return { start: d, end: d.plus({ days: 1 }) }
    case "agenda":
      return { start: d.startOf("month"), end: d.startOf("month").plus({ months: 1 }) }
    case "upcoming": {
      const now = DateTime.now().setZone(d.zone).startOf("day")
      return { start: now, end: now.plus({ days: 90 }) }
    }
    case "list":
    default:
      return { start: d.startOf("month"), end: d.startOf("month").plus({ months: 3 }) }
  }
}

/** Moves the anchor date one step in a view's natural unit. */
export function stepDate(view, date, direction) {
  const unit = {
    year: { years: 1 },
    multiMonth: { months: 3 },
    month: { months: 1 },
    agenda: { months: 1 },
    list: { months: 3 },
    week: { weeks: 1 },
    workWeek: { weeks: 1 },
    timeline: { weeks: 1 },
    day: { days: 1 },
    resources: { days: 1 },
    upcoming: { months: 3 },
  }[view] || { months: 1 }
  return direction > 0 ? date.plus(unit) : date.minus(unit)
}

/** Title shown in the toolbar for the current view and date. */
export function viewTitle(view, date, prefs) {
  const { start, end } = rangeForView(view, date, prefs)
  const last = end.minus({ days: 1 })
  switch (view) {
    case "year":
      return date.toFormat("yyyy")
    case "multiMonth":
      return `${start.toFormat("LLL")} – ${last.toFormat("LLL yyyy")}`
    case "month":
    case "agenda":
      return date.toFormat("LLLL yyyy")
    case "list":
      return `${start.toFormat("LLL")} – ${last.toFormat("LLL yyyy")}`
    case "day":
    case "resources":
      return date.toFormat("cccc, LLLL d, yyyy")
    case "upcoming":
      return "Upcoming events"
    default: {
      const s = view === "workWeek" ? firstWorkingDay(start, prefs) : start
      const e = view === "workWeek" ? lastWorkingDay(last, prefs) : last
      return s.month === e.month
        ? `${s.toFormat("LLL d")} – ${e.toFormat("d, yyyy")}`
        : `${s.toFormat("LLL d")} – ${e.toFormat("LLL d, yyyy")}`
    }
  }
}

function firstWorkingDay(start, prefs) {
  for (let i = 0; i < 7; i++) {
    const d = start.plus({ days: i })
    if (prefs.workingDays.includes(d.weekday)) return d
  }
  return start
}
function lastWorkingDay(last, prefs) {
  for (let i = 0; i < 7; i++) {
    const d = last.minus({ days: i })
    if (prefs.workingDays.includes(d.weekday)) return d
  }
  return last
}

/** "9:00 AM – 10:30 AM", "All day", or a multi-day span, in the display zone. */
export function formatEventTime(occurrence, zone, { hour12 = true, withDate = false } = {}) {
  const timeFormat = hour12 ? "h:mm a" : "HH:mm"
  if (occurrence.allDay) {
    const start = fromJS(occurrence.start, "utc")
    const last = fromJS(occurrence.end, "utc").minus({ days: 1 })
    if (last <= start) return withDate ? `${start.toFormat("ccc, LLL d")} · All day` : "All day"
    return `${start.toFormat("ccc, LLL d")} – ${last.toFormat("ccc, LLL d")} · All day`
  }
  const start = fromJS(occurrence.start, zone)
  const end = fromJS(occurrence.end, zone)
  if (start.hasSame(end, "day")) {
    const times = `${start.toFormat(timeFormat)} – ${end.toFormat(timeFormat)}`
    return withDate ? `${start.toFormat("ccc, LLL d")} · ${times}` : times
  }
  return `${start.toFormat(`ccc, LLL d, ${timeFormat}`)} – ${end.toFormat(`ccc, LLL d, ${timeFormat}`)}`
}

/** Occurrence start/end as DateTimes in the zone they should be laid out in. */
export function occurrenceSpan(occurrence, zone) {
  // All-day dates are floating: keep them on the same calendar days in every zone.
  if (occurrence.allDay) {
    const s = fromJS(occurrence.start, "utc")
    const e = fromJS(occurrence.end, "utc")
    return {
      start: DateTime.fromObject({ year: s.year, month: s.month, day: s.day }, { zone }),
      end: DateTime.fromObject({ year: e.year, month: e.month, day: e.day }, { zone }),
    }
  }
  return { start: fromJS(occurrence.start, zone), end: fromJS(occurrence.end, zone) }
}

/** past | ongoing | upcoming */
export function timeState(occurrence, now = new Date()) {
  const start = new Date(occurrence.start)
  const end = new Date(occurrence.end)
  if (end <= now) return "past"
  if (start <= now) return "ongoing"
  return "upcoming"
}

/** Value for <input type="date"> / "datetime-local" in a zone. */
export const toDateInput = (dt) => dt.toFormat("yyyy-MM-dd")
export const toTimeInput = (dt) => dt.toFormat("HH:mm")

/** Combines date and time input values in a zone into a JS Date. */
export function fromInputs(date, time, zone) {
  return DateTime.fromISO(`${date}T${time || "00:00"}`, { zone }).toJSDate()
}

/** Date-only value stored as UTC midnight (all-day events). */
export const allDayDate = (date) => DateTime.fromISO(date, { zone: "utc" }).toJSDate()

/** Relative label like "in 3 days", "in 2 h", "now". */
export function relativeLabel(occurrence, now = DateTime.now()) {
  const start = DateTime.fromJSDate(new Date(occurrence.start))
  const state = timeState(occurrence, now.toJSDate())
  if (state === "ongoing") return "Happening now"
  if (state === "past") return start.toRelative({ base: now })
  return start.toRelative({ base: now, round: true })
}
