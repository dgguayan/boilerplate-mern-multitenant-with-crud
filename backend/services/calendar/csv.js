import { DateTime, IANAZone } from 'luxon';
import { toRRule } from './recurrence.js';

export const CSV_COLUMNS = [
  'Title', 'Start', 'End', 'All day', 'Time zone', 'Category', 'Status', 'Visibility',
  'Location', 'Address', 'Online link', 'Organizer', 'Organizer email', 'Tags',
  'Price', 'Currency', 'Capacity', 'Summary', 'Description', 'External link', 'Recurrence',
];

/** Quotes a cell and neutralises spreadsheet formulas (CSV injection). */
function cell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatLocal(date, event) {
  const dt = DateTime.fromJSDate(new Date(date), { zone: event.allDay ? 'utc' : event.timeZone });
  return event.allDay ? dt.toISODate() : dt.toFormat('yyyy-MM-dd HH:mm');
}

export function buildCsv(events, categories = new Map()) {
  const rows = [CSV_COLUMNS.map(cell).join(',')];
  for (const event of events) {
    // All-day end dates are exclusive in storage; show the inclusive last day.
    const endDate = event.allDay ? new Date(new Date(event.end).getTime() - 86_400_000) : event.end;
    rows.push(
      [
        event.title,
        formatLocal(event.start, event),
        formatLocal(endDate, event),
        event.allDay ? 'yes' : 'no',
        event.timeZone,
        categories.get(String(event.categoryId)) || '',
        event.status,
        event.visibility,
        event.location?.name,
        event.location?.address,
        event.virtualUrl,
        event.organizer?.name,
        event.organizer?.email,
        (event.tags || []).join('; '),
        event.price?.amount ?? '',
        event.price?.currency ?? '',
        event.capacity ?? '',
        event.summary,
        event.description,
        event.externalUrl,
        toRRule(event) || '',
      ]
        .map(cell)
        .join(',')
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

/** RFC 4180 parser: returns an array of rows (arrays of strings). */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const uncell = (value) => (value?.startsWith("'") && /^'[=+\-@]/.test(value) ? value.slice(1) : value)?.trim();

/**
 * Parses a CSV file (same columns as the export; extra columns are ignored).
 * Returns { events, warnings, skipped } with category names left for the caller to resolve.
 */
export function parseCsv(text, { fallbackZone = 'UTC' } = {}) {
  const rows = parseCsvRows(text);
  const warnings = [];
  if (!rows.length) return { events: [], warnings: ['The file is empty.'], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name.toLowerCase());
  if (col('Title') === -1 || col('Start') === -1) {
    return { events: [], warnings: ['The CSV needs at least "Title" and "Start" columns.'], skipped: rows.length - 1 };
  }

  const events = [];
  let skipped = 0;
  rows.slice(1).forEach((row, index) => {
    const get = (name) => (col(name) === -1 ? '' : uncell(row[col(name)] ?? '') || '');
    const line = index + 2;
    const allDay = /^(yes|true|1)$/i.test(get('All day')) || /^\d{4}-\d{2}-\d{2}$/.test(get('Start'));
    let zone = get('Time zone') || fallbackZone;
    if (!IANAZone.isValidZone(zone)) {
      warnings.push(`Row ${line}: unknown time zone "${zone}", used ${fallbackZone}.`);
      zone = fallbackZone;
    }
    const parse = (value) => {
      if (!value) return null;
      const formats = ['yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH:mm:ss', "yyyy-MM-dd'T'HH:mm", 'yyyy-MM-dd'];
      for (const format of formats) {
        const dt = DateTime.fromFormat(value, format, { zone: allDay ? 'utc' : zone });
        if (dt.isValid) return allDay ? dt.startOf('day') : dt;
      }
      const iso = DateTime.fromISO(value, { zone: allDay ? 'utc' : zone });
      return iso.isValid ? iso : null;
    };
    const start = parse(get('Start'));
    if (!get('Title') || !start) {
      warnings.push(`Row ${line}: missing title or invalid start date — skipped.`);
      skipped++;
      return;
    }
    let end = parse(get('End'));
    if (allDay) end = (end && end >= start ? end : start).plus({ days: 1 }); // inclusive → exclusive
    else if (!end || end <= start) end = start.plus({ hours: 1 });

    const amount = parseFloat(get('Price'));
    const capacity = parseInt(get('Capacity'), 10);
    const url = (value) => (/^https?:\/\//i.test(value) ? value : undefined);
    const status = get('Status').toLowerCase();
    const visibility = get('Visibility').toLowerCase();
    events.push({
      title: get('Title').slice(0, 160),
      start: start.toJSDate(),
      end: end.toJSDate(),
      allDay,
      timeZone: zone,
      categoryName: get('Category'),
      status: ['draft', 'published', 'postponed', 'cancelled', 'archived'].includes(status) ? status : 'published',
      visibility: ['public', 'restricted', 'private'].includes(visibility) ? visibility : 'restricted',
      location: get('Location') || get('Address') ? { name: get('Location').slice(0, 200), address: get('Address').slice(0, 300) } : undefined,
      virtualUrl: url(get('Online link')),
      organizer: get('Organizer') || get('Organizer email') ? { name: get('Organizer').slice(0, 120), email: get('Organizer email') || undefined } : undefined,
      tags: get('Tags').split(/[;,]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
      price: Number.isFinite(amount) ? { amount, currency: (get('Currency') || 'USD').toUpperCase().slice(0, 3) } : undefined,
      capacity: Number.isFinite(capacity) ? capacity : undefined,
      summary: get('Summary').slice(0, 300) || undefined,
      description: get('Description').slice(0, 8000) || undefined,
      externalUrl: url(get('External link')),
      rrule: get('Recurrence') || undefined,
    });
  });
  return { events, warnings, skipped };
}
