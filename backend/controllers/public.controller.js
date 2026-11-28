import Joi from 'joi';
import * as publicCalendar from '../services/public.service.js';
import * as apiResponse from '../utils/apiResponse.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const appUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '') || null;
const safeFileName = (name) => name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'event';

const rangeQuery = Joi.object({
  start: Joi.date().iso().required(),
  end: Joi.date().iso().required(),
  category: Joi.string().hex().length(24),
});

// Browsers keep a copy but check it with the server each time (cheap, thanks to ETags), so an
// admin turning the public calendar off takes effect immediately.
const cacheShort = (res) => res.setHeader('Cache-Control', 'public, no-cache');

export const listEvents = handle(async (req, res) => {
  const { value, error } = rangeQuery.validate(req.query, { stripUnknown: true });
  if (error) return apiResponse.error(res, error.details[0].message.replace(/"/g, "'"), 422);
  const result = await publicCalendar.listPublicEvents({ slug: req.params.tenant, start: value.start, end: value.end, categoryId: value.category });
  cacheShort(res);
  return apiResponse.success(res, result);
});

export const getEvent = handle(async (req, res) => {
  const result = await publicCalendar.getPublicEvent({ slug: req.params.tenant, eventSlug: req.params.slug });
  return apiResponse.success(res, result);
});

export const eventIcs = handle(async (req, res) => {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(req.query.occurrence || '') ? req.query.occurrence : undefined;
  const { ics, event } = await publicCalendar.publicEventIcs({ slug: req.params.tenant, eventSlug: req.params.slug, occurrenceKey: key, appUrl: appUrl() });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(event.title)}.ics"`);
  res.send(ics);
});

export const feed = handle(async (req, res) => {
  const ics = await publicCalendar.publicFeedIcs({ slug: req.params.tenant, appUrl: appUrl() });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=900');
  res.send(ics);
});
