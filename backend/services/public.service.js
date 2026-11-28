import { DateTime } from 'luxon';
import CalendarEvent from '../models/CalendarEvent.model.js';
import CalendarCategory from '../models/CalendarCategory.model.js';
import Tenant from '../models/Tenant.model.js';
import { expandRange, httpError, occurrenceAt } from './calendar.service.js';
import { expandOccurrences } from './calendar/recurrence.js';
import { buildIcs } from './calendar/ics.js';

/*
 * Public calendar: read-only, no sign-in. A workspace shows nothing until an admin turns the
 * public calendar on, and then only events that are
 *   - marked "public", and
 *   - published, postponed or cancelled (never drafts or archived), and
 *   - in a public category, or in none.
 */

const VISITOR = { role: 'public', userId: null }; // never an editor
const PUBLIC_STATUSES = ['published', 'postponed', 'cancelled'];
const MAX_DAYS = 400;

// Fields a visitor may see. Internal ones (who created it, resources, import ids…) are left out.
const PUBLIC_FIELDS = [
  'title', 'slug', 'summary', 'description', 'imageUrl', 'start', 'end', 'allDay', 'timeZone',
  'recurrence', 'exdates', 'seriesId', 'recurrenceKey', 'categoryId', 'color', 'location', 'virtualUrl',
  'organizer', 'contact', 'status', 'capacity', 'registrationDeadline', 'price', 'externalUrl',
  'attachments', 'customFields', 'tags', 'viewCount',
];
const pick = (doc) => Object.fromEntries(PUBLIC_FIELDS.filter((f) => doc[f] !== undefined).map((f) => [f, doc[f]]));

export async function publicTenant(slug) {
  const tenant = await Tenant.findOne({ slug: String(slug || '').toLowerCase(), isActive: true, 'publicCalendar.enabled': true })
    .select('name slug')
    .lean();
  if (!tenant) throw httpError(404, 'This calendar is not public.');
  return tenant;
}

async function publicCategories(tenantId) {
  return CalendarCategory.find({ tenantId, deleted: false, visibility: 'public' })
    .sort({ order: 1, name: 1 })
    .select('name color icon description')
    .lean();
}

function publicFilter(tenantId, categoryIds) {
  return {
    tenantId,
    deleted: false,
    visibility: 'public',
    status: { $in: PUBLIC_STATUSES },
    $or: [{ categoryId: null }, { categoryId: { $in: categoryIds } }],
  };
}

const visitorOccurrence = ({ canEdit, resourceIds, myRsvp, ...rest }) => rest;

/** Upcoming public occurrences in [start, end), optionally in one category. */
export async function listPublicEvents({ slug, start, end, categoryId }) {
  const tenant = await publicTenant(slug);
  if (!(start < end)) throw httpError(422, 'The range end must be after its start.');
  if ((end - start) / 86_400_000 > MAX_DAYS) throw httpError(422, `The date range can span at most ${MAX_DAYS} days.`);
  const categories = await publicCategories(tenant._id);
  const filter = publicFilter(tenant._id, categories.map((c) => c._id));
  // One category: only its events (an unknown or non-public id matches nothing).
  if (categoryId) filter.$or = [{ categoryId: { $in: categories.filter((c) => String(c._id) === String(categoryId)).map((c) => c._id) } }];
  const { occurrences, truncated } = await expandRange({ filter, start, end, user: VISITOR });
  return {
    tenant: { name: tenant.name, slug: tenant.slug },
    categories: categories.map((c) => ({ id: String(c._id), name: c.name, color: c.color, icon: c.icon, description: c.description || '' })),
    occurrences: occurrences.map(visitorOccurrence),
    truncated,
  };
}

/** One public event by its slug, with the next dates of a series. Counts a view. */
export async function getPublicEvent({ slug, eventSlug }) {
  const tenant = await publicTenant(slug);
  const categories = await publicCategories(tenant._id);
  const filter = publicFilter(tenant._id, categories.map((c) => c._id));
  const event = await CalendarEvent.findOneAndUpdate(
    { ...filter, slug: String(eventSlug || '') },
    { $inc: { viewCount: 1 } },
    { new: true, timestamps: false }
  ).lean();
  if (!event) throw httpError(404, 'Event not found');

  let upcoming = [];
  if (event.recurrence?.freq) {
    const now = new Date();
    const { occurrences } = await expandRange({
      filter: { ...filter, $and: [{ $or: [{ _id: event._id }, { seriesId: event._id }] }] },
      start: now,
      end: DateTime.fromJSDate(now).plus({ days: MAX_DAYS }).toJSDate(),
      user: VISITOR,
    });
    upcoming = occurrences.slice(0, 12).map((o) => ({
      key: o.recurrenceKey,
      start: o.start,
      end: o.end,
      status: o.status,
      title: o.title,
      slug: o.slug,
      isOverride: o.isOverride,
    }));
  }
  const category = categories.find((c) => String(c._id) === String(event.categoryId));
  return {
    tenant: { name: tenant.name, slug: tenant.slug },
    event: { id: String(event._id), ...pick(event), category: category ? { name: category.name, color: category.color, icon: category.icon } : null },
    upcoming,
  };
}

const uidDomain = (tenant) => `${tenant.slug}.calendar`;
const publicEventUrl = (appUrl, tenant) => (event) => (appUrl ? `${appUrl}/p/${tenant.slug}/events/${event.slug}` : null);

/** Subscribe feed: every public event from 60 days back to a year ahead. */
export async function publicFeedIcs({ slug, appUrl }) {
  const tenant = await publicTenant(slug);
  const categories = await publicCategories(tenant._id);
  const filter = publicFilter(tenant._id, categories.map((c) => c._id));
  const start = DateTime.now().minus({ days: 60 }).toJSDate();
  const end = DateTime.now().plus({ days: 366 }).toJSDate();
  const [singles, series] = await Promise.all([
    CalendarEvent.find({ ...filter, recurrence: null, seriesId: null, start: { $lt: end }, end: { $gt: start } }).lean(),
    CalendarEvent.find({ ...filter, 'recurrence.freq': { $exists: true }, start: { $lt: end } }).lean(),
  ]);
  const activeSeries = series.filter((s) => expandOccurrences(s, start, end).length > 0);
  const overrides = await CalendarEvent.find({ ...filter, seriesId: { $in: activeSeries.map((s) => s._id) } }).lean();
  return buildIcs({
    events: [...singles, ...activeSeries],
    overrides,
    categories: new Map(categories.map((c) => [String(c._id), c.name])),
    calendarName: `${tenant.name} events`,
    uidDomain: uidDomain(tenant),
    eventUrl: publicEventUrl(appUrl, tenant),
  });
}

/** One public event (or one date of a series) as an .ics download. */
export async function publicEventIcs({ slug, eventSlug, occurrenceKey, appUrl }) {
  const tenant = await publicTenant(slug);
  const categories = await publicCategories(tenant._id);
  const filter = publicFilter(tenant._id, categories.map((c) => c._id));
  const event = await CalendarEvent.findOne({ ...filter, slug: String(eventSlug || '') }).lean();
  if (!event) throw httpError(404, 'Event not found');
  const names = new Map(categories.map((c) => [String(c._id), c.name]));
  const common = { categories: names, calendarName: event.title, uidDomain: uidDomain(tenant), eventUrl: publicEventUrl(appUrl, tenant) };
  if (occurrenceKey && event.recurrence?.freq) {
    const occ = occurrenceAt(event, occurrenceKey);
    const single = { ...event, _id: `${event._id}-${occurrenceKey}`, start: occ.start, end: occ.end, recurrence: null, exdates: [], externalUid: null };
    return { ics: buildIcs({ events: [single], ...common }), event };
  }
  const overrides = event.recurrence?.freq ? await CalendarEvent.find({ ...filter, seriesId: event._id }).lean() : [];
  return { ics: buildIcs({ events: [event], overrides, ...common }), event };
}

/* ── Sharing settings (signed-in) ─────────────────────── */

export async function getSharing(user) {
  const tenant = await Tenant.findById(user.tenantId).select('name slug publicCalendar').lean();
  const categories = await publicCategories(user.tenantId);
  const publicEvents = await CalendarEvent.countDocuments({
    ...publicFilter(user.tenantId, categories.map((c) => c._id)),
    $and: [{ $or: [{ end: { $gte: new Date() } }, { 'recurrence.freq': { $exists: true } }] }],
  });
  return { name: tenant.name, slug: tenant.slug, publicEnabled: Boolean(tenant.publicCalendar?.enabled), publicEvents };
}

export async function setSharing(user, { publicEnabled }) {
  await Tenant.updateOne(
    { _id: user.tenantId },
    { 'publicCalendar.enabled': Boolean(publicEnabled), ...(publicEnabled && { 'publicCalendar.enabledAt': new Date() }) }
  );
  return getSharing(user);
}
