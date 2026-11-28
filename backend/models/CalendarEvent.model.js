import mongoose from 'mongoose';
import { VISIBILITIES } from './CalendarCategory.model.js';

export const EVENT_STATUSES = ['draft', 'published', 'postponed', 'cancelled', 'archived'];
export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

const { ObjectId } = mongoose.Schema.Types;

const recurrenceSchema = new mongoose.Schema(
  {
    freq: { type: String, enum: RECURRENCE_FREQS, required: true },
    interval: { type: Number, min: 1, max: 365, default: 1 },
    // ISO weekdays, 1 = Monday … 7 = Sunday (weekly rules)
    byWeekday: [{ type: Number, min: 1, max: 7 }],
    // monthly rules: same day of month, or the same nth weekday ("2nd Tuesday", "last Friday")
    monthlyMode: { type: String, enum: ['dayOfMonth', 'nthWeekday'], default: 'dayOfMonth' },
    // UI shortcut only; 'weekdays' / 'weekends' are stored as weekly rules
    preset: { type: String, enum: ['weekdays', 'weekends', null], default: null },
    end: {
      type: { type: String, enum: ['never', 'until', 'count'], default: 'never' },
      until: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // inclusive, in the event's time zone
      count: { type: Number, min: 1, max: 1000 },
    },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 8000 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },

    // Timed events: UTC instants, shown in any zone. All-day events: UTC midnight of the
    // (floating) start date and of the exclusive end date.
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    timeZone: { type: String, required: true, default: 'UTC' }, // IANA zone the event is planned in

    recurrence: { type: recurrenceSchema, default: null },
    exdates: [{ type: String, match: /^\d{4}-\d{2}-\d{2}$/ }], // skipped occurrences (local dates)
    // An edited single occurrence of a series is stored as its own document:
    seriesId: { type: ObjectId, ref: 'CalendarEvent', index: true },
    recurrenceKey: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },

    categoryId: { type: ObjectId, ref: 'CalendarCategory' },
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    location: {
      name: { type: String, trim: true, maxlength: 200 },
      address: { type: String, trim: true, maxlength: 300 },
      mapUrl: { type: String, trim: true, maxlength: 2048 },
    },
    virtualUrl: { type: String, trim: true, maxlength: 2048 },
    organizer: {
      name: { type: String, trim: true, maxlength: 120 },
      email: { type: String, trim: true, maxlength: 200 },
      phone: { type: String, trim: true, maxlength: 40 },
      website: { type: String, trim: true, maxlength: 2048 },
    },
    contact: {
      email: { type: String, trim: true, maxlength: 200 },
      phone: { type: String, trim: true, maxlength: 40 },
    },
    status: { type: String, enum: EVENT_STATUSES, default: 'published' },
    capacity: { type: Number, min: 0 },
    registrationDeadline: { type: Date },
    price: {
      amount: { type: Number, min: 0 },
      currency: { type: String, match: /^[A-Z]{3}$/ },
    },
    externalUrl: { type: String, trim: true, maxlength: 2048 },
    attachments: [
      {
        _id: false,
        name: { type: String, trim: true, maxlength: 200 },
        url: { type: String, trim: true, maxlength: 2048 },
      },
    ],
    customFields: [
      {
        _id: false,
        label: { type: String, trim: true, maxlength: 60 },
        value: { type: String, trim: true, maxlength: 500 },
      },
    ],
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    visibility: { type: String, enum: VISIBILITIES, default: 'restricted' },
    resourceIds: [{ type: ObjectId, ref: 'CalendarResource' }],

    externalUid: { type: String, trim: true, maxlength: 500 }, // UID from an imported calendar
    viewCount: { type: Number, default: 0 },

    tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User' },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Range queries for single events and series
eventSchema.index({ tenantId: 1, deleted: 1, start: 1, end: 1 });
eventSchema.index({ tenantId: 1, deleted: 1, 'recurrence.freq': 1 });
eventSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
eventSchema.index({ tenantId: 1, externalUid: 1 }, { sparse: true });

export default mongoose.model('CalendarEvent', eventSchema);
