/**
 * Calendar seed
 * Usage: npm run seed:calendar   (run `npm run seed` first — it creates the Acme tenant and users)
 *
 * Replaces the Acme tenant's calendar data with sample categories, resources and events
 * around the current date, chosen so every calendar feature has something to show:
 *
 *  - Event shapes: timed, all-day, multi-day all-day, multi-day timed, overnight, other time zones
 *  - Repeats: daily (until a date), weekdays, weekends, weekly on several days, every 2 weeks
 *    (n times), monthly on a date, monthly on the nth / last weekday, yearly
 *  - Series exceptions: a skipped occurrence (exdate) and an occurrence edited on its own
 *  - Every status (draft, published, postponed, cancelled, archived) and visibility
 *  - Details: banner images, colour overrides, location + map, online link, organizer, contact,
 *    capacity, registration deadline, free and paid prices, attachments, custom fields, tags,
 *    an imported event (externalUid) and view counts for the "Most viewed" sort
 *  - Resources of every type, a double-booked room (conflict) and a crowded day ("+N more")
 *
 * Users and projects are not touched.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Tenant from '../models/Tenant.model.js';
import User from '../models/User.model.js';
import CalendarCategory from '../models/CalendarCategory.model.js';
import CalendarResource from '../models/CalendarResource.model.js';
import CalendarEvent from '../models/CalendarEvent.model.js';

const ZONE = 'America/New_York';
const slug = (title) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomBytes(4).toString('hex')}`;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const tenant = await Tenant.findOne({ slug: 'acme' });
  if (!tenant) throw new Error('Tenant "acme" not found. Run `npm run seed` first.');
  const admin = await User.findOne({ tenantId: tenant._id, role: 'admin' });
  const manager = await User.findOne({ tenantId: tenant._id, role: 'manager' });

  await Promise.all([
    CalendarEvent.deleteMany({ tenantId: tenant._id }),
    CalendarCategory.deleteMany({ tenantId: tenant._id }),
    CalendarResource.deleteMany({ tenantId: tenant._id }),
  ]);

  const owned = { tenantId: tenant._id, createdBy: admin._id };
  const categoryList = await CalendarCategory.insertMany([
    { name: 'Meetings', color: '#2563eb', icon: 'users', description: 'Internal meetings and syncs', visibility: 'restricted', order: 0, ...owned },
    { name: 'Workshops', color: '#7c3aed', icon: 'presentation', description: 'Hands-on training sessions', visibility: 'public', order: 1, ...owned },
    { name: 'Webinars', color: '#0891b2', icon: 'video', description: 'Online talks open to customers', visibility: 'public', order: 2, ...owned },
    { name: 'Social', color: '#db2777', icon: 'party-popper', description: 'Team events and celebrations', visibility: 'restricted', order: 3, ...owned },
    { name: 'Deadlines', color: '#dc2626', icon: 'trophy', description: 'Releases and due dates', visibility: 'restricted', order: 4, ...owned },
    { name: 'Operations', color: '#f59e0b', icon: 'wrench', description: 'Maintenance windows and on-call', visibility: 'restricted', order: 5, ...owned },
    { name: 'Travel', color: '#059669', icon: 'plane', description: 'Conferences and trips', visibility: 'public', order: 6, ...owned },
    { name: 'Leadership', color: '#475569', icon: 'briefcase', description: 'Leadership-only sessions', visibility: 'private', order: 7, ...owned },
  ]);
  const cat = Object.fromEntries(categoryList.map((c) => [c.name, c._id]));

  const resourceList = await CalendarResource.insertMany([
    { name: 'Boardroom', type: 'room', capacity: 12, color: '#2563eb', description: 'Floor 3, video conferencing', order: 0, ...owned },
    { name: 'Studio', type: 'room', capacity: 30, color: '#7c3aed', description: 'Floor 2, stage and seating', order: 1, ...owned },
    { name: 'Focus room', type: 'room', capacity: 4, color: '#059669', order: 2, ...owned },
    { name: 'Projector kit', type: 'equipment', color: '#0891b2', description: 'Portable projector and screen', order: 3, ...owned },
    { name: 'On-call engineer', type: 'person', color: '#f59e0b', description: 'Whoever holds the pager this week', order: 4, ...owned },
    { name: 'Company van', type: 'vehicle', capacity: 8, color: '#db2777', order: 5, ...owned },
    { name: 'Event tent', type: 'other', color: '#64748b', description: 'Outdoor 6×6 m tent', order: 6, ...owned },
  ]);
  const res = Object.fromEntries(resourceList.map((r) => [r.name, r._id]));

  const today = DateTime.now().setZone(ZONE).startOf('day');
  const at = (days, hour, minute = 0, zone = ZONE) =>
    DateTime.fromObject({ ...today.plus({ days }).toObject(), hour, minute, second: 0, millisecond: 0 }, { zone });
  const toMonday = today.weekday - 1;
  const monday = (weeks = 0) => weeks * 7 - toMonday; // day offset of a Monday, relative to today
  const timed = (days, hour, minutes, extra = {}) => {
    const zone = extra.timeZone || ZONE;
    const start = at(days, hour, 0, zone);
    return { start: start.toJSDate(), end: start.plus({ minutes }).toJSDate(), timeZone: zone, ...extra };
  };
  const timedFrom = (start, minutes, extra = {}) => ({ start: start.toJSDate(), end: start.plus({ minutes }).toJSDate(), timeZone: ZONE, ...extra });
  const allDayOn = (date, length, extra = {}) => {
    const start = DateTime.fromISO(date.toISODate(), { zone: 'utc' });
    return { start: start.toJSDate(), end: start.plus({ days: length }).toJSDate(), allDay: true, timeZone: ZONE, ...extra };
  };
  const allDay = (days, length, extra) => allDayOn(today.plus({ days }), length, extra);

  // Anchors for the monthly / yearly series
  const lastFriday = (month) => {
    const end = month.endOf('month').startOf('day');
    return end.minus({ days: (end.weekday - 5 + 7) % 7 });
  };
  const lastFridayAnchor = lastFriday(today.minus({ months: 2 }));
  const payrollAnchor = today.minus({ months: 3 }).set({ day: 15 });
  const foundingDay = today.plus({ days: 40 }).minus({ years: 4 });

  // The stand-up series gets one skipped and one separately edited occurrence next week
  const skippedStandUp = today.plus({ days: monday(1) + 4 }).toISODate(); // next Friday
  const movedStandUp = today.plus({ days: monday(1) + 2 }); // next Wednesday

  const events = [
    // ── Recurring series ────────────────────────────────────────────────
    {
      key: 'standup',
      title: 'Team stand-up', summary: 'Daily 15-minute sync', categoryId: cat.Meetings, resourceIds: [res['Focus room']],
      ...timed(monday(-3), 9, 15),
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], preset: 'weekdays', end: { type: 'never' } },
      exdates: [skippedStandUp],
      virtualUrl: 'https://meet.google.com/abc-defg-hij',
      organizer: { name: 'Dana Reyes', email: 'dana@acme.example' },
      tags: ['team', 'daily'], viewCount: 42,
    },
    {
      title: 'Product review', summary: 'Fortnightly demo of shipped work', categoryId: cat.Meetings, resourceIds: [res.Boardroom],
      ...timed(monday(-4) + 3, 14, 60),
      recurrence: { freq: 'weekly', interval: 2, byWeekday: [4], end: { type: 'count', count: 12 } },
      location: { name: 'Boardroom', address: '100 Main St, Floor 3' },
      organizer: { name: 'Priya Shah', email: 'priya@acme.example' },
      tags: ['product'],
    },
    {
      title: '1:1 coaching', summary: 'Manager check-ins on Tuesdays and Thursdays', categoryId: cat.Meetings,
      ...timed(monday(-2) + 1, 11, 30),
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [2, 4], end: { type: 'until', until: today.plus({ days: 60 }).toISODate() } },
      visibility: 'restricted', tags: ['people'], createdBy: manager?._id,
    },
    {
      title: 'Onboarding bootcamp', summary: 'One hour every day during new-hire week', categoryId: cat.Workshops, resourceIds: [res.Studio],
      ...timed(-2, 9, 60, { timeZone: ZONE }),
      recurrence: { freq: 'daily', interval: 1, end: { type: 'until', until: today.plus({ days: 4 }).toISODate() } },
      tags: ['onboarding'],
    },
    {
      title: 'Weekend support rota', summary: 'Customer support coverage', categoryId: cat.Operations, resourceIds: [res['On-call engineer']],
      ...timed(monday(-1) + 5, 10, 240),
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [6, 7], preset: 'weekends', end: { type: 'count', count: 16 } },
      contact: { email: 'support@acme.example', phone: '+1 555 0100' }, tags: ['support', 'on-call'],
    },
    {
      title: 'Monthly all-hands', summary: 'Company update and Q&A', categoryId: cat.Meetings, resourceIds: [res.Studio, res['Projector kit']],
      ...timed(-40, 16, 60),
      recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'nthWeekday', end: { type: 'never' } },
      location: { name: 'Studio' }, tags: ['company'], viewCount: 18,
    },
    {
      title: 'Demo day', summary: 'Teams show what they built — last Friday of every month', categoryId: cat.Social, resourceIds: [res.Studio],
      ...timedFrom(lastFridayAnchor.set({ hour: 16 }), 90),
      recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'nthWeekday', end: { type: 'never' } },
      tags: ['company', 'demo'],
    },
    {
      title: 'Payroll run', categoryId: cat.Deadlines, color: '#16a34a',
      ...allDayOn(payrollAnchor, 1),
      recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'dayOfMonth', end: { type: 'never' } },
      visibility: 'private', tags: ['finance'],
    },
    {
      title: 'Acme founding day', summary: 'Our birthday — cake in the kitchen', categoryId: cat.Social, color: '#eab308',
      ...allDayOn(foundingDay, 1),
      recurrence: { freq: 'yearly', interval: 1, end: { type: 'never' } },
      visibility: 'public', tags: ['company'],
    },

    // ── Rich single events ──────────────────────────────────────────────
    {
      title: 'Design systems workshop', categoryId: cat.Workshops, resourceIds: [res.Studio, res['Projector kit']],
      summary: 'Build accessible components with the design team',
      description:
        'A hands-on session covering tokens, theming and accessible patterns.\n\n' +
        'Agenda:\n• 10:00 Tokens and theming\n• 11:00 Accessible components\n• 12:30 Q&A\n\nBring a laptop.',
      imageUrl: '/images/calendar/workshop.svg',
      ...timed(2, 10, 180), capacity: 24, registrationDeadline: at(1, 17).toJSDate(),
      price: { amount: 0, currency: 'USD' }, visibility: 'public', tags: ['design', 'accessibility'],
      location: { name: 'Studio', address: '100 Main St, Floor 2', mapUrl: 'https://www.openstreetmap.org/search?query=100%20Main%20St' },
      organizer: { name: 'Lee Chen', email: 'lee@acme.example', phone: '+1 555 0142', website: 'https://example.com' },
      contact: { email: 'events@acme.example', phone: '+1 555 0199' },
      attachments: [
        { name: 'Workshop agenda (PDF)', url: '/docs/employee-handbook.pdf' },
        { name: 'Accessibility checklist (PDF)', url: '/docs/security-overview.pdf' },
      ],
      customFields: [{ label: 'Level', value: 'Intermediate' }, { label: 'Dress code', value: 'Casual' }],
      viewCount: 128,
    },
    {
      title: 'Customer webinar: What’s new', categoryId: cat.Webinars, summary: 'Live product tour for customers',
      imageUrl: '/images/calendar/webinar.svg',
      ...timed(6, 12, 60), virtualUrl: 'https://zoom.us/j/1234567890', capacity: 500,
      registrationDeadline: at(6, 11).toJSDate(),
      price: { amount: 0, currency: 'USD' }, visibility: 'public', tags: ['customers', 'product'],
      organizer: { name: 'Priya Shah', email: 'priya@acme.example' }, viewCount: 311,
    },
    {
      title: 'Advanced analytics masterclass', categoryId: cat.Workshops, summary: 'Paid deep-dive session',
      imageUrl: '/images/calendar/masterclass.svg',
      ...timed(12, 13, 120), capacity: 40, price: { amount: 49, currency: 'USD' }, visibility: 'public',
      registrationDeadline: at(10, 23).toJSDate(), tags: ['analytics'], resourceIds: [res.Boardroom],
      externalUrl: 'https://example.com/masterclass',
      attachments: [{ name: 'Pre-reading: Quarterly report (PDF)', url: '/docs/quarterly-report.pdf' }],
      customFields: [{ label: 'Prerequisites', value: 'Basic SQL' }], viewCount: 87,
    },
    {
      title: 'Partner sync — Tokyo', summary: 'Planned in Tokyo time; shows in your own zone', categoryId: cat.Meetings,
      ...timed(3, 9, 45, { timeZone: 'Asia/Tokyo' }), virtualUrl: 'https://teams.microsoft.com/l/meetup-join/example',
      organizer: { name: 'Kenji Watanabe', email: 'kenji@partner.example' }, tags: ['partners'],
    },
    {
      title: 'London office drop-in', summary: 'Planned in London time', categoryId: cat.Social,
      ...timed(8, 15, 60, { timeZone: 'Europe/London' }), location: { name: 'Acme London', address: '1 King St, London' },
    },
    {
      title: 'Database migration window', summary: 'Overnight maintenance — app read-only', categoryId: cat.Operations,
      ...timed(5, 22, 300), resourceIds: [res['On-call engineer']], color: '#ea580c',
      description: 'Expect up to 5 minutes of downtime around 01:00.', tags: ['maintenance'],
      contact: { email: 'ops@acme.example' },
    },
    {
      title: 'SaaS Summit', summary: 'Three-day conference; booth and talks', categoryId: cat.Travel,
      ...timedFrom(at(14, 9), 3 * 24 * 60 - 16 * 60), // Day 14 09:00 → day 16 17:00
      resourceIds: [res['Company van']], location: { name: 'Javits Center', address: '429 11th Ave, New York, NY', mapUrl: 'https://www.openstreetmap.org/search?query=Javits%20Center' },
      externalUrl: 'https://example.com/saas-summit', price: { amount: 299, currency: 'USD' }, visibility: 'public', tags: ['conference', 'sales'],
      viewCount: 56,
    },
    { title: 'Release 4.2 code freeze', categoryId: cat.Deadlines, ...allDay(9, 1), tags: ['release'] },
    {
      title: 'Company offsite', categoryId: cat.Social, summary: 'Two days of planning and fun', imageUrl: '/images/calendar/offsite.svg',
      ...allDay(18, 3), resourceIds: [res['Company van'], res['Event tent']],
      location: { name: 'Lakeside Lodge', address: 'Lake Placid, NY' }, tags: ['company'], viewCount: 64,
    },
    {
      title: 'Partner launch (imported)', summary: 'Imported from a partner’s .ics feed', categoryId: cat.Webinars,
      ...allDay(11, 1), externalUid: 'partner-launch-2026@partner.example', tags: ['partners', 'imported'],
    },

    // ── Statuses and visibility ─────────────────────────────────────────
    { title: 'Quarterly planning (postponed)', categoryId: cat.Leadership, ...timed(4, 11, 90), status: 'postponed', visibility: 'private', resourceIds: [res.Boardroom] },
    { title: 'Holiday party', categoryId: cat.Social, ...timed(25, 18, 180), status: 'cancelled', tags: ['company'] },
    { title: 'Draft: Hackathon kickoff', categoryId: cat.Social, ...timed(30, 9, 60), status: 'draft', createdBy: manager?._id },
    { title: 'Q3 retrospective', categoryId: cat.Meetings, ...timed(-30, 10, 60), status: 'archived', summary: 'Kept for the record' },
    { title: 'Security training', categoryId: cat.Workshops, ...timed(-6, 15, 60), tags: ['security'], resourceIds: [res.Studio] },

    // ── Today: a resource conflict ──────────────────────────────────────
    { title: 'Board prep', categoryId: cat.Meetings, ...timed(0, 13, 60), resourceIds: [res.Boardroom] },
    { title: 'Interview loop', categoryId: cat.Meetings, ...timed(0, 13, 90), resourceIds: [res.Boardroom], summary: 'Double-booked on purpose to show a conflict' },
    { title: 'Team lunch', categoryId: cat.Social, ...timed(0, 12, 60), location: { name: 'Café Roma' } },

    // ── Tomorrow: a crowded day for the "+N more" overflow ──────────────
    { title: 'Budget review', categoryId: cat.Leadership, ...timed(1, 8, 45), visibility: 'private' },
    { title: 'Sales pipeline', categoryId: cat.Meetings, ...timed(1, 10, 30) },
    { title: 'Customer call: Globex', categoryId: cat.Meetings, ...timed(1, 11, 30), virtualUrl: 'https://zoom.us/j/9876543210' },
    { title: 'Hiring sync', categoryId: cat.Meetings, ...timed(1, 13, 30), createdBy: manager?._id },
    { title: 'Ops handover', categoryId: cat.Operations, ...timed(1, 15, 30), resourceIds: [res['On-call engineer']] },
    { title: 'Book club', categoryId: cat.Social, ...timed(1, 17, 60), location: { name: 'Kitchen' } },
  ];

  const docs = await CalendarEvent.insertMany(
    events.map(({ key, ...event }) => ({
      visibility: 'restricted',
      status: 'published',
      ...owned,
      ...event,
      createdBy: event.createdBy || admin._id,
      slug: slug(event.title),
    }))
  );
  const standUp = docs[events.findIndex((e) => e.key === 'standup')];

  // One stand-up occurrence edited on its own: moved later, renamed and relocated
  const movedStart = movedStandUp.set({ hour: 10, minute: 30 });
  await CalendarEvent.create({
    ...owned,
    title: 'Team stand-up (moved after all-hands)',
    slug: slug('Team stand-up moved'),
    summary: 'This one occurrence was edited separately from the series',
    start: movedStart.toJSDate(),
    end: movedStart.plus({ minutes: 15 }).toJSDate(),
    timeZone: ZONE,
    categoryId: cat.Meetings,
    resourceIds: [res.Boardroom],
    location: { name: 'Boardroom' },
    organizer: standUp.organizer,
    tags: ['team', 'daily'],
    visibility: 'restricted',
    status: 'published',
    seriesId: standUp._id,
    recurrenceKey: movedStandUp.toISODate(),
  });

  console.log(
    `Seeded ${categoryList.length} categories, ${resourceList.length} resources and ${events.length + 1} events ` +
      `(${events.filter((e) => e.recurrence).length} series, 1 edited occurrence) for ${tenant.name}.`
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
