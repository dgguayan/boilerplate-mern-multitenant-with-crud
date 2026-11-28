import { DateTime, IANAZone } from 'luxon';
import { ICS_DAYS, toRRule } from './recurrence.js';

/* -------------------------------------------------------------------------- */
/*                                   Export                                   */
/* -------------------------------------------------------------------------- */

const escapeText = (value = '') =>
  String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 75 octets (RFC 5545 §3.1). */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = Buffer.byteLength(char, 'utf8');
    if (size + charSize > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utcStamp = (date) => DateTime.fromJSDate(new Date(date)).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

function dateProp(name, date, event) {
  const dt = DateTime.fromJSDate(new Date(date), { zone: event.allDay ? 'utc' : event.timeZone });
  if (event.allDay) return `${name};VALUE=DATE:${dt.toFormat('yyyyMMdd')}`;
  if (event.timeZone === 'UTC') return `${name}:${dt.toFormat("yyyyMMdd'T'HHmmss'Z'")}`;
  return `${name};TZID=${event.timeZone}:${dt.toFormat("yyyyMMdd'T'HHmmss")}`;
}

/** Local wall time of an occurrence key, as used by EXDATE and RECURRENCE-ID. */
function keyProp(name, key, series) {
  const start = DateTime.fromJSDate(new Date(series.start), { zone: series.allDay ? 'utc' : series.timeZone });
  const [year, month, day] = key.split('-').map(Number);
  const local = start.set({ year, month, day });
  return dateProp(name, local.toJSDate(), series);
}

const ICS_STATUS = { published: 'CONFIRMED', cancelled: 'CANCELLED', postponed: 'TENTATIVE', draft: 'TENTATIVE', archived: 'CONFIRMED' };

function eventLines(event, { uidDomain, categoryName, series, appUrl }) {
  const uid = event.externalUid || `${(series || event)._id}@${uidDomain}`;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(event.updatedAt || new Date())}`,
    dateProp('DTSTART', event.start, event),
    dateProp('DTEND', event.end, event),
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (series && event.recurrenceKey) lines.push(keyProp('RECURRENCE-ID', event.recurrenceKey, series));
  const rrule = !series && toRRule(event);
  if (rrule) lines.push(`RRULE:${rrule}`);
  if (!series) for (const key of event.exdates || []) lines.push(keyProp('EXDATE', key, event));

  const description = [event.summary, event.description].filter(Boolean).join('\n\n');
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  const location = [event.location?.name, event.location?.address].filter(Boolean).join(', ') || event.virtualUrl;
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  const url = event.externalUrl || event.virtualUrl || (appUrl && `${appUrl}/calendar?event=${event._id}`);
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (categoryName) lines.push(`CATEGORIES:${escapeText(categoryName)}`);
  if (event.organizer?.email) {
    lines.push(`ORGANIZER;CN=${escapeText(event.organizer.name || event.organizer.email)}:mailto:${event.organizer.email}`);
  }
  lines.push(`STATUS:${ICS_STATUS[event.status] || 'CONFIRMED'}`);
  lines.push(`CLASS:${event.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'}`);
  if (event.updatedAt) lines.push(`LAST-MODIFIED:${utcStamp(event.updatedAt)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Builds an iCalendar file.
 * @param {object[]} events   series masters and single events
 * @param {object[]} overrides edited occurrences (seriesId set)
 */
export function buildIcs({ events, overrides = [], calendarName, uidDomain, categories = new Map(), appUrl }) {
  const seriesById = new Map(events.map((e) => [String(e._id), e]));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MERN Multitenant//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(...eventLines(event, { uidDomain, categoryName: categories.get(String(event.categoryId)), appUrl }));
  }
  for (const override of overrides) {
    const series = seriesById.get(String(override.seriesId));
    const categoryName = categories.get(String(override.categoryId));
    if (series) lines.push(...eventLines(override, { uidDomain, categoryName, series, appUrl }));
    else lines.push(...eventLines({ ...override, recurrenceKey: null }, { uidDomain, categoryName, appUrl }));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* -------------------------------------------------------------------------- */
/*                                   Import                                   */
/* -------------------------------------------------------------------------- */

// Calendars exported from Outlook/Exchange use Windows zone names.
const WINDOWS_ZONES = {
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'UTC': 'UTC',
};

const unescapeText = (value = '') =>
  value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseLine(line) {
  // NAME;PARAM=VALUE;PARAM="VALUE":VALUE — the first ':' outside quotes ends the parameters
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params = {};
  for (const param of rawParams) {
    const eq = param.indexOf('=');
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function resolveZone(tzid, fallbackZone, warnings) {
  if (!tzid) return null;
  const cleaned = tzid.replace(/^\//, '');
  if (IANAZone.isValidZone(cleaned)) return cleaned;
  if (WINDOWS_ZONES[cleaned]) return WINDOWS_ZONES[cleaned];
  warnings.add(`Unknown time zone "${tzid}" — used ${fallbackZone} instead.`);
  return fallbackZone;
}

/** Parses DATE / DATE-TIME values: { date: Date, allDay, zone }. */
function parseDateValue(prop, fallbackZone, warnings) {
  const value = prop.value.trim().split(',')[0];
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const dt = DateTime.fromFormat(value.slice(0, 8), 'yyyyMMdd', { zone: 'utc' });
    return dt.isValid ? { date: dt.toJSDate(), allDay: true, zone: null } : null;
  }
  const match = value.match(/^(\d{8}T\d{6})(Z?)$/);
  if (!match) return null;
  const zone = match[2] ? 'UTC' : resolveZone(prop.params.TZID, fallbackZone, warnings) || fallbackZone;
  const dt = DateTime.fromFormat(match[1], "yyyyMMdd'T'HHmmss", { zone });
  return dt.isValid ? { date: dt.toJSDate(), allDay: false, zone } : null;
}

function parseDuration(value) {
  const m = value.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, w, d, h, min, s] = m;
  const ms = ((+w || 0) * 604800 + (+d || 0) * 86400 + (+h || 0) * 3600 + (+min || 0) * 60 + (+s || 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

/** Converts an RRULE into our recurrence model, or explains why it can't. */
export function parseRRule(value, start, zone, allDay) {
  const parts = Object.fromEntries(value.split(';').map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = parts.FREQ?.toLowerCase();
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return { error: `unsupported frequency ${parts.FREQ}` };
  const supported = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST']);
  const extra = Object.keys(parts).filter((k) => !supported.has(k));
  // BYMONTHDAY / BYMONTH matching the start date are implied by our rules
  const local = DateTime.fromJSDate(start, { zone: allDay ? 'utc' : zone });
  for (const key of extra) {
    if (key === 'BYMONTHDAY' && Number(parts[key]) === local.day) continue;
    if (key === 'BYMONTH' && Number(parts[key]) === local.month) continue;
    return { error: `unsupported rule part ${key}` };
  }
  const recurrence = { freq, interval: Math.max(1, parseInt(parts.INTERVAL, 10) || 1), monthlyMode: 'dayOfMonth', end: { type: 'never' } };
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',');
    const ordinal = days.length === 1 && days[0].match(/^([+-]?\d)([A-Z]{2})$/);
    if (ordinal && freq === 'monthly') {
      recurrence.monthlyMode = 'nthWeekday';
    } else if (freq === 'weekly' || freq === 'daily') {
      const weekdays = days.map((d) => ICS_DAYS.indexOf(d.slice(-2)) + 1).filter((d) => d > 0);
      if (!weekdays.length) return { error: 'unsupported BYDAY' };
      if (freq === 'daily') recurrence.freq = 'weekly';
      recurrence.byWeekday = weekdays;
    } else {
      return { error: 'unsupported BYDAY' };
    }
  }
  if (parts.COUNT) recurrence.end = { type: 'count', count: Math.min(1000, Math.max(1, parseInt(parts.COUNT, 10))) };
  if (parts.UNTIL) {
    const untilProp = { value: parts.UNTIL, params: {} };
    const parsed = parseDateValue(untilProp, zone, new Set());
    if (parsed) {
      const untilLocal = DateTime.fromJSDate(parsed.date, { zone: allDay || parsed.allDay ? 'utc' : zone });
      recurrence.end = { type: 'until', until: untilLocal.toISODate() };
    }
  }
  return { recurrence };
}

/**
 * Parses an iCalendar file into event drafts (our model, without tenant/user fields).
 * Returns { events, overrides, warnings, skipped }.
 */
export function parseIcs(text, { fallbackZone = 'UTC' } = {}) {
  const warnings = new Set();
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const vevents = [];
  let current = null;
  let depth = 0;
  for (const raw of unfolded) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') {
      current = [];
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('BEGIN:')) depth++; // nested VALARM etc.
    else if (line.startsWith('END:') && line !== 'END:VEVENT') depth--;
    else if (line === 'END:VEVENT') {
      vevents.push(current);
      current = null;
    } else if (depth === 0) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }

  const events = [];
  const overrides = [];
  let skipped = 0;
  for (const props of vevents) {
    const get = (name) => props.find((p) => p.name === name);
    const all = (name) => props.filter((p) => p.name === name);
    const startProp = get('DTSTART');
    const summary = get('SUMMARY');
    const start = startProp && parseDateValue(startProp, fallbackZone, warnings);
    if (!start) {
      skipped++;
      continue;
    }
    let end = null;
    const endProp = get('DTEND');
    if (endProp) end = parseDateValue(endProp, start.zone || fallbackZone, warnings)?.date;
    if (!end && get('DURATION')) {
      const ms = parseDuration(get('DURATION').value);
      if (ms) end = new Date(start.date.getTime() + ms);
    }
    if (!end || end <= start.date) {
      end = new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 3_600_000));
    }

    const statusValue = get('STATUS')?.value?.toUpperCase();
    const draft = {
      externalUid: get('UID')?.value?.slice(0, 500),
      title: unescapeText(summary?.value || 'Untitled event').slice(0, 160),
      description: get('DESCRIPTION') ? unescapeText(get('DESCRIPTION').value).slice(0, 8000) : undefined,
      start: start.date,
      end,
      allDay: start.allDay,
      timeZone: start.allDay ? fallbackZone : start.zone || fallbackZone,
      status: statusValue === 'CANCELLED' ? 'cancelled' : statusValue === 'TENTATIVE' ? 'postponed' : 'published',
      visibility: get('CLASS')?.value?.toUpperCase() === 'PUBLIC' ? 'public' : 'restricted',
      tags: all('CATEGORIES')
        .flatMap((p) => p.value.split(','))
        .map((t) => unescapeText(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    };
    const location = get('LOCATION') && unescapeText(get('LOCATION').value).trim();
    if (location) {
      if (/^https?:\/\//i.test(location)) draft.virtualUrl = location;
      else draft.location = { name: location.slice(0, 200) };
    }
    const url = get('URL')?.value;
    if (url && /^https?:\/\//i.test(url)) draft.externalUrl = url;
    const organizer = get('ORGANIZER');
    if (organizer) {
      const email = organizer.value.replace(/^mailto:/i, '');
      draft.organizer = { name: organizer.params.CN?.slice(0, 120), email: /@/.test(email) ? email : undefined };
    }

    const rrule = get('RRULE');
    if (rrule) {
      const parsed = parseRRule(rrule.value, start.date, draft.timeZone, draft.allDay);
      if (parsed.error) warnings.add(`"${draft.title}": ${parsed.error}; imported as a single event.`);
      else draft.recurrence = parsed.recurrence;
      const localZone = draft.allDay ? 'utc' : draft.timeZone;
      draft.exdates = all('EXDATE')
        .flatMap((p) => p.value.split(',').map((value) => ({ ...p, value })))
        .map((p) => parseDateValue(p, draft.timeZone, warnings))
        .filter(Boolean)
        .map((d) => DateTime.fromJSDate(d.date, { zone: localZone }).toISODate());
    }

    const recurrenceId = get('RECURRENCE-ID');
    if (recurrenceId) {
      const original = parseDateValue(recurrenceId, draft.timeZone, warnings);
      if (original) {
        draft.recurrenceKey = DateTime.fromJSDate(original.date, { zone: draft.allDay ? 'utc' : draft.timeZone }).toISODate();
        overrides.push(draft);
        continue;
      }
    }
    events.push(draft);
  }
  return { events, overrides, warnings: [...warnings], skipped };
}
