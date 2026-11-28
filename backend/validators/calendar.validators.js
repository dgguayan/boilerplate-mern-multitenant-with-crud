import Joi from 'joi';
import { IANAZone } from 'luxon';
import { EVENT_STATUSES, RECURRENCE_FREQS } from '../models/CalendarEvent.model.js';
import { CATEGORY_ICONS, VISIBILITIES } from '../models/CalendarCategory.model.js';
import { RESOURCE_TYPES } from '../models/CalendarResource.model.js';

const objectId = Joi.string().hex().length(24);
const dateKey = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('Dates must use the YYYY-MM-DD format');
const hexColor = Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).message('Colors must be hex values like #3b82f6');
// Only web links — never javascript:, data: or other schemes that could run script.
const httpUrl = Joi.string().trim().max(2048).uri({ scheme: ['http', 'https'] });
// Web links or same-site paths ("/docs/agenda.pdf")
const linkUrl = Joi.alternatives(httpUrl, Joi.string().trim().max(2048).pattern(/^\/(?!\/)\S*$/));
const phone = Joi.string().trim().max(40).pattern(/^[+()\d\s.-]{3,40}$/).message('Enter a valid phone number');
const email = Joi.string().trim().max(200).email({ tlds: false });
export const timeZone = Joi.string()
  .max(64)
  .custom((value, helpers) => (IANAZone.isValidZone(value) ? value : helpers.error('any.invalid')))
  .messages({ 'any.invalid': 'Unknown time zone' });

const recurrence = Joi.object({
  freq: Joi.string().valid(...RECURRENCE_FREQS).required(),
  interval: Joi.number().integer().min(1).max(365).default(1),
  byWeekday: Joi.array().items(Joi.number().integer().min(1).max(7)).unique().max(7),
  monthlyMode: Joi.string().valid('dayOfMonth', 'nthWeekday').default('dayOfMonth'),
  preset: Joi.string().valid('weekdays', 'weekends').allow(null),
  end: Joi.object({
    type: Joi.string().valid('never', 'until', 'count').default('never'),
    until: dateKey.when('type', { is: 'until', then: Joi.required() }),
    count: Joi.number().integer().min(1).max(1000).when('type', { is: 'count', then: Joi.required() }),
  }).default({ type: 'never' }),
}).allow(null);

const eventFields = {
  title: Joi.string().trim().min(1).max(160),
  summary: Joi.string().trim().max(300).allow(''),
  description: Joi.string().trim().max(8000).allow(''),
  imageUrl: linkUrl.allow(''),
  start: Joi.date().iso(),
  end: Joi.date().iso(),
  allDay: Joi.boolean(),
  timeZone,
  recurrence,
  exdates: Joi.array().items(dateKey).unique().max(1000),
  categoryId: objectId.allow(null),
  color: hexColor.allow(null),
  location: Joi.object({
    name: Joi.string().trim().max(200).allow(''),
    address: Joi.string().trim().max(300).allow(''),
    mapUrl: httpUrl.allow(''),
  }).allow(null),
  virtualUrl: httpUrl.allow(''),
  organizer: Joi.object({
    name: Joi.string().trim().max(120).allow(''),
    email: email.allow(''),
    phone: phone.allow(''),
    website: httpUrl.allow(''),
  }).allow(null),
  contact: Joi.object({ email: email.allow(''), phone: phone.allow('') }).allow(null),
  status: Joi.string().valid(...EVENT_STATUSES),
  capacity: Joi.number().integer().min(0).max(1_000_000).allow(null),
  registrationDeadline: Joi.date().iso().allow(null),
  price: Joi.object({
    amount: Joi.number().min(0).max(1_000_000).allow(null),
    currency: Joi.string().uppercase().pattern(/^[A-Z]{3}$/).default('USD'),
  }).allow(null),
  externalUrl: httpUrl.allow(''),
  attachments: Joi.array()
    .items(Joi.object({ name: Joi.string().trim().min(1).max(200).required(), url: linkUrl.required() }))
    .max(20),
  customFields: Joi.array()
    .items(Joi.object({ label: Joi.string().trim().min(1).max(60).required(), value: Joi.string().trim().max(500).allow('') }))
    .max(20),
  tags: Joi.array().items(Joi.string().trim().lowercase().min(1).max(40)).unique().max(20),
  visibility: Joi.string().valid(...VISIBILITIES),
  resourceIds: Joi.array().items(objectId).unique().max(20),
};

export const createEventSchema = Joi.object({
  ...eventFields,
  title: eventFields.title.required(),
  start: eventFields.start.required(),
  end: eventFields.end.required(),
  timeZone: timeZone.default('UTC'),
});

export const updateEventSchema = Joi.object({
  scope: Joi.string().valid('this', 'following', 'all').default('all'),
  occurrenceKey: dateKey,
  data: Joi.object(eventFields).min(1).required(),
});

// Snapshots carry every editable field, with null for unset ones.
const snapshotSchema = Joi.object({
  ...Object.fromEntries(Object.entries(eventFields).map(([key, schema]) => [key, schema.allow(null)])),
  title: eventFields.title.required(),
  start: eventFields.start.required(),
  end: eventFields.end.required(),
  timeZone: timeZone.required(),
  deleted: Joi.boolean(),
});

export const revertSchema = Joi.object({
  changes: Joi.array()
    .items(Joi.object({ id: objectId.required(), state: snapshotSchema.allow(null).required() }))
    .min(1)
    .max(200)
    .required(),
});

export const conflictsSchema = Joi.object({
  start: Joi.date().iso().required(),
  end: Joi.date().iso().greater(Joi.ref('start')).required(),
  resourceIds: Joi.array().items(objectId).max(20).default([]),
  excludeIds: Joi.array().items(Joi.string().max(64)).max(20).default([]),
});

export const categorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(60).required(),
  color: hexColor.required(),
  icon: Joi.string().valid(...CATEGORY_ICONS).default('calendar'),
  description: Joi.string().trim().max(300).allow(''),
  visibility: Joi.string().valid(...VISIBILITIES).default('restricted'),
  order: Joi.number().integer().min(0).max(10_000),
});

export const resourceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  type: Joi.string().valid(...RESOURCE_TYPES).default('room'),
  capacity: Joi.number().integer().min(0).max(100_000).allow(null),
  color: hexColor.allow(null),
  description: Joi.string().trim().max(300).allow(''),
  order: Joi.number().integer().min(0).max(10_000),
});

export const rangeQuerySchema = Joi.object({
  start: Joi.date().iso().required(),
  end: Joi.date().iso().required(),
  format: Joi.string().valid('ics', 'csv').default('ics'),
});

export const importQuerySchema = Joi.object({
  format: Joi.string().valid('ics', 'csv').required(),
  timeZone: timeZone.default('UTC'),
});

/** Validates an imported event draft with the same rules as the API. */
export function validateImportedEvent(draft) {
  const { value, error } = createEventSchema.validate(draft, { abortEarly: true, stripUnknown: true });
  return { value, error: error?.details[0]?.message.replace(/"/g, "'") };
}
