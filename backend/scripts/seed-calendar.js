/**
 * Calendar seed
 * Usage: npm run seed:calendar   (run `npm run seed` first — it creates the Acme tenant and users)
 *
 * Replaces the Acme tenant's calendar data with sample categories, resources and events
 * around the current date: single, all-day, multi-day and recurring events.
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
    { name: 'Leadership', color: '#475569', icon: 'briefcase', description: 'Leadership-only sessions', visibility: 'private', order: 5, ...owned },
  ]);
  const cat = Object.fromEntries(categoryList.map((c) => [c.name, c._id]));

  const resourceList = await CalendarResource.insertMany([
    { name: 'Boardroom', type: 'room', capacity: 12, color: '#2563eb', order: 0, ...owned },
    { name: 'Studio', type: 'room', capacity: 30, color: '#7c3aed', order: 1, ...owned },
    { name: 'Focus room', type: 'room', capacity: 4, color: '#059669', order: 2, ...owned },
    { name: 'Projector kit', type: 'equipment', order: 3, ...owned },
  ]);
  const res = Object.fromEntries(resourceList.map((r) => [r.name, r._id]));

  const today = DateTime.now().setZone(ZONE).startOf('day');
  const at = (days, hour, minute = 0) => today.plus({ days }).set({ hour, minute });
  const monday = today.minus({ days: today.weekday - 1 });
  const timed = (days, hour, minutes, extra) => {
    const start = at(days, hour);
    return { start: start.toJSDate(), end: start.plus({ minutes }).toJSDate(), timeZone: ZONE, ...extra };
  };
  const allDay = (days, length, extra) => {
    const start = DateTime.fromISO(today.plus({ days }).toISODate(), { zone: 'utc' });
    return { start: start.toJSDate(), end: start.plus({ days: length }).toJSDate(), allDay: true, timeZone: ZONE, ...extra };
  };

  const events = [
    {
      title: 'Team stand-up', summary: 'Daily 15-minute sync', categoryId: cat.Meetings, resourceIds: [res['Focus room']],
      ...timed(monday.diff(today, 'days').days - 21, 9, 15),
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], preset: 'weekdays', end: { type: 'never' } },
      virtualUrl: 'https://meet.google.com/abc-defg-hij',
      organizer: { name: 'Dana Reyes', email: 'dana@acme.example' },
      tags: ['team', 'daily'],
    },
    {
      title: 'Product review', summary: 'Fortnightly demo of shipped work', categoryId: cat.Meetings, resourceIds: [res.Boardroom],
      ...timed(monday.diff(today, 'days').days + 3 - 28, 14, 60),
      recurrence: { freq: 'weekly', interval: 2, byWeekday: [4], end: { type: 'count', count: 12 } },
      location: { name: 'Boardroom', address: '100 Main St, Floor 3' },
      organizer: { name: 'Priya Shah', email: 'priya@acme.example' },
      tags: ['product'],
    },
    {
      title: 'Monthly all-hands', summary: 'Company update and Q&A', categoryId: cat.Meetings, resourceIds: [res.Studio, res['Projector kit']],
      ...timed(-40, 16, 60),
      recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'nthWeekday', end: { type: 'never' } },
      location: { name: 'Studio' }, visibility: 'restricted', tags: ['company'],
    },
    {
      title: 'Design systems workshop', categoryId: cat.Workshops, resourceIds: [res.Studio],
      summary: 'Build accessible components with the design team',
      description: 'A hands-on session covering tokens, theming and accessible patterns.\n\nBring a laptop.',
      ...timed(2, 10, 180), capacity: 24, registrationDeadline: at(1, 17).toJSDate(),
      price: { amount: 0, currency: 'USD' }, visibility: 'public', tags: ['design', 'accessibility'],
      location: { name: 'Studio', address: '100 Main St, Floor 2', mapUrl: 'https://www.openstreetmap.org/search?query=100%20Main%20St' },
      organizer: { name: 'Lee Chen', email: 'lee@acme.example', website: 'https://example.com' },
      attachments: [{ name: 'Workshop agenda (PDF)', url: '/docs/employee-handbook.pdf' }],
      customFields: [{ label: 'Level', value: 'Intermediate' }],
    },
    {
      title: 'Customer webinar: What’s new', categoryId: cat.Webinars, summary: 'Live product tour for customers',
      ...timed(6, 12, 60), virtualUrl: 'https://zoom.us/j/1234567890', capacity: 500,
      price: { amount: 0, currency: 'USD' }, visibility: 'public', tags: ['customers', 'product'],
    },
    {
      title: 'Advanced analytics masterclass', categoryId: cat.Workshops, summary: 'Paid deep-dive session',
      ...timed(12, 13, 120), capacity: 40, price: { amount: 49, currency: 'USD' }, visibility: 'public',
      registrationDeadline: at(10, 23).toJSDate(), tags: ['analytics'], resourceIds: [res.Boardroom],
      externalUrl: 'https://example.com/masterclass',
    },
    { title: 'Release 4.2 code freeze', categoryId: cat.Deadlines, ...allDay(9, 1, {}), tags: ['release'] },
    { title: 'Company offsite', categoryId: cat.Social, summary: 'Two days of planning and fun', ...allDay(18, 3, {}), location: { name: 'Lakeside Lodge', address: 'Lake Placid, NY' }, tags: ['company'] },
    { title: 'Quarterly planning (postponed)', categoryId: cat.Leadership, ...timed(4, 11, 90), status: 'postponed', visibility: 'private', resourceIds: [res.Boardroom] },
    { title: 'Holiday party', categoryId: cat.Social, ...timed(25, 18, 180), status: 'cancelled', tags: ['company'] },
    { title: 'Draft: Hackathon kickoff', categoryId: cat.Social, ...timed(30, 9, 60), status: 'draft', createdBy: manager?._id },
    { title: 'Security training', categoryId: cat.Workshops, ...timed(-6, 15, 60), tags: ['security'], resourceIds: [res.Studio] },
    { title: 'Board prep', categoryId: cat.Meetings, ...timed(0, 13, 60), resourceIds: [res.Boardroom] },
    { title: 'Interview loop', categoryId: cat.Meetings, ...timed(0, 13, 90), resourceIds: [res.Boardroom], summary: 'Double-booked on purpose to show a conflict' },
    { title: 'Team lunch', categoryId: cat.Social, ...timed(0, 12, 60), location: { name: 'Café Roma' } },
  ];

  await CalendarEvent.insertMany(
    events.map((event) => ({
      visibility: 'restricted',
      status: 'published',
      ...owned,
      ...event,
      createdBy: event.createdBy || admin._id,
      slug: slug(event.title),
    }))
  );

  console.log(`Seeded ${categoryList.length} categories, ${resourceList.length} resources and ${events.length} events for ${tenant.name}.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
