import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { countBefore, expandOccurrences, toRRule } from '../services/calendar/recurrence.js';
import { buildIcs, parseIcs } from '../services/calendar/ics.js';
import { buildCsv, parseCsv } from '../services/calendar/csv.js';

const zoned = (iso, zone) => DateTime.fromISO(iso, { zone }).toJSDate();
const range = (from, to) => [new Date(from), new Date(to)];
const local = (date, zone) => DateTime.fromJSDate(date, { zone }).toFormat('yyyy-MM-dd HH:mm');

test('weekly meeting keeps its local time across a DST change', () => {
  const zone = 'America/New_York';
  const event = {
    start: zoned('2026-10-26T09:00', zone),
    end: zoned('2026-10-26T10:00', zone),
    timeZone: zone,
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [1], end: { type: 'never' } },
  };
  const occ = expandOccurrences(event, ...range('2026-10-25', '2026-11-17'));
  assert.deepEqual(occ.map((o) => local(o.start, zone)), [
    '2026-10-26 09:00', '2026-11-02 09:00', '2026-11-09 09:00', '2026-11-16 09:00',
  ]);
  // Same local time, different UTC offset after DST ends on Nov 1
  assert.equal(occ[0].start.toISOString(), '2026-10-26T13:00:00.000Z');
  assert.equal(occ[1].start.toISOString(), '2026-11-02T14:00:00.000Z');
  assert.ok(occ.every((o) => o.end - o.start === 3_600_000));
});

test('monthly on the 31st skips shorter months; nth weekday and last weekday', () => {
  const zone = 'UTC';
  const on31 = {
    start: zoned('2026-01-31T12:00', zone), end: zoned('2026-01-31T13:00', zone), timeZone: zone,
    recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'dayOfMonth', end: { type: 'never' } },
  };
  assert.deepEqual(
    expandOccurrences(on31, ...range('2026-01-01', '2026-06-01')).map((o) => o.key),
    ['2026-01-31', '2026-03-31', '2026-05-31']
  );
  const secondTuesday = { ...on31, start: zoned('2026-01-13T12:00', zone), end: zoned('2026-01-13T13:00', zone), recurrence: { ...on31.recurrence, monthlyMode: 'nthWeekday' } };
  assert.deepEqual(
    expandOccurrences(secondTuesday, ...range('2026-01-01', '2026-04-01')).map((o) => o.key),
    ['2026-01-13', '2026-02-10', '2026-03-10']
  );
  const lastFriday = { ...secondTuesday, start: zoned('2026-01-30T12:00', zone), end: zoned('2026-01-30T13:00', zone) };
  assert.deepEqual(
    expandOccurrences(lastFriday, ...range('2026-01-01', '2026-04-01')).map((o) => o.key),
    ['2026-01-30', '2026-02-27', '2026-03-27']
  );
});

test('weekdays rule, count, until, interval and exception dates', () => {
  const zone = 'Europe/Berlin';
  const base = { start: zoned('2026-03-02T08:30', zone), end: zoned('2026-03-02T09:00', zone), timeZone: zone };
  const weekdays = { ...base, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], end: { type: 'count', count: 7 } }, exdates: ['2026-03-04'] };
  // COUNT includes the skipped date, as RFC 5545 specifies
  assert.deepEqual(
    expandOccurrences(weekdays, ...range('2026-03-01', '2026-04-01')).map((o) => o.key),
    ['2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06', '2026-03-09', '2026-03-10']
  );
  const everyThirdDay = { ...base, recurrence: { freq: 'daily', interval: 3, end: { type: 'until', until: '2026-03-12' } } };
  assert.deepEqual(
    expandOccurrences(everyThirdDay, ...range('2026-03-01', '2026-04-01')).map((o) => o.key),
    ['2026-03-02', '2026-03-05', '2026-03-08', '2026-03-11']
  );
  assert.equal(countBefore(everyThirdDay, '2026-03-08'), 2);
  // Berlin switches to summer time on March 29: 08:30 stays 08:30
  const daily = { ...base, recurrence: { freq: 'daily', interval: 1, end: { type: 'never' } } };
  const around = expandOccurrences(daily, ...range('2026-03-28', '2026-03-31'));
  assert.deepEqual(around.map((o) => local(o.start, zone)), ['2026-03-28 08:30', '2026-03-29 08:30', '2026-03-30 08:30']);
});

test('yearly on Feb 29 only in leap years; all-day multi-day events keep their length', () => {
  const leap = {
    start: new Date('2024-02-29T00:00:00Z'), end: new Date('2024-03-02T00:00:00Z'), allDay: true, timeZone: 'UTC',
    recurrence: { freq: 'yearly', interval: 1, end: { type: 'never' } },
  };
  const occ = expandOccurrences(leap, ...range('2024-01-01', '2033-01-01'));
  assert.deepEqual(occ.map((o) => o.key), ['2024-02-29', '2028-02-29', '2032-02-29']);
  assert.ok(occ.every((o) => o.end - o.start === 2 * 86_400_000));
});

test('occurrences replaced by edited copies are skipped', () => {
  const event = {
    start: new Date('2026-05-04T10:00:00Z'), end: new Date('2026-05-04T11:00:00Z'), timeZone: 'UTC',
    recurrence: { freq: 'daily', interval: 1, end: { type: 'count', count: 3 } },
  };
  const keys = expandOccurrences(event, ...range('2026-05-01', '2026-06-01'), new Set(['2026-05-05'])).map((o) => o.key);
  assert.deepEqual(keys, ['2026-05-04', '2026-05-06']);
});

test('RRULE output', () => {
  const zone = 'America/New_York';
  const event = {
    start: zoned('2026-10-26T09:00', zone), end: zoned('2026-10-26T10:00', zone), timeZone: zone,
    recurrence: { freq: 'weekly', interval: 2, byWeekday: [1, 3], end: { type: 'until', until: '2026-12-31' } },
  };
  assert.equal(toRRule(event), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20270101T045959Z');
});

test('ICS export → import round trip keeps rule, zone, exceptions and edited occurrences', () => {
  const zone = 'Europe/London';
  const series = {
    _id: 'abc123', title: 'Stand-up, daily; team', summary: 'Quick sync', start: zoned('2026-06-01T09:15', zone),
    end: zoned('2026-06-01T09:30', zone), timeZone: zone, status: 'published', visibility: 'restricted',
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], end: { type: 'count', count: 20 } },
    exdates: ['2026-06-03'], location: { name: 'Room 4' },
  };
  const override = { ...series, _id: 'ovr1', seriesId: 'abc123', recurrenceKey: '2026-06-04', recurrence: null, exdates: [], start: zoned('2026-06-04T10:00', zone), end: zoned('2026-06-04T10:30', zone) };
  const ics = buildIcs({ events: [series], overrides: [override], calendarName: 'Test', uidDomain: 'test.calendar' });
  assert.match(ics, /DTSTART;TZID=Europe\/London:20260601T091500/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=20/);
  assert.match(ics, /SUMMARY:Stand-up\\, daily\\; team/);
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));

  const parsed = parseIcs(ics);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.overrides.length, 1);
  const [event] = parsed.events;
  assert.equal(event.title, 'Stand-up, daily; team');
  assert.equal(event.timeZone, zone);
  assert.equal(event.start.toISOString(), series.start.toISOString());
  assert.deepEqual(event.recurrence.byWeekday, [1, 2, 3, 4, 5]);
  assert.deepEqual(event.recurrence.end, { type: 'count', count: 20 });
  assert.deepEqual(event.exdates, ['2026-06-03']);
  assert.equal(parsed.overrides[0].recurrenceKey, '2026-06-04');
});

test('ICS import handles all-day dates, Windows zones, folded lines and unsupported rules', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:one', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261227',
    'SUMMARY:Holiday br', ' eak', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:two', 'DTSTART;TZID=Pacific Standard Time:20261102T080000', 'DURATION:PT45M', 'SUMMARY:Call',
    'RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const { events, warnings } = parseIcs(ics);
  assert.equal(events[0].title, 'Holiday break');
  assert.equal(events[0].allDay, true);
  assert.equal((events[0].end - events[0].start) / 86_400_000, 3);
  assert.equal(events[1].timeZone, 'America/Los_Angeles');
  assert.equal(events[1].end - events[1].start, 45 * 60_000);
  assert.equal(events[1].recurrence, undefined);
  assert.ok(warnings.some((w) => w.includes('BYSETPOS')));
});

test('CSV export neutralises formulas and round-trips', () => {
  const event = {
    title: '=HYPERLINK("http://evil")', start: zoned('2026-07-01T14:00', 'Asia/Tokyo'), end: zoned('2026-07-01T15:30', 'Asia/Tokyo'),
    timeZone: 'Asia/Tokyo', status: 'published', visibility: 'public', tags: ['a', 'b'], description: 'Line one\nLine "two"',
  };
  const csv = buildCsv([event]);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
  const { events, warnings } = parseCsv(csv);
  assert.deepEqual(warnings, []);
  assert.equal(events[0].title, event.title);
  assert.equal(events[0].start.toISOString(), event.start.toISOString());
  assert.equal(events[0].description, event.description);
  assert.deepEqual(events[0].tags, ['a', 'b']);
});
