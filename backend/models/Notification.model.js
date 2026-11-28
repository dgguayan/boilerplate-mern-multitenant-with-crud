import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'event_reminder', // an event you're going to starts soon
  'event_changed', // its time or place changed
  'event_cancelled',
  'event_postponed',
  'event_deleted',
  'waitlist_promoted', // you got a place
];

const { ObjectId } = mongoose.Schema.Types;

const notificationSchema = new mongoose.Schema(
  {
    tenantId: { type: ObjectId, ref: 'Tenant', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 500 }, // in-app path, e.g. /calendar?event=…&occurrence=…
    eventId: { type: ObjectId, ref: 'CalendarEvent' },
    occurrenceKey: { type: String },
    readAt: { type: Date, default: null },
    // Makes a notification send once: a reminder per person per occurrence.
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, readAt: 1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
// Old notifications clear themselves after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('Notification', notificationSchema);
