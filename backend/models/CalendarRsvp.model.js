import mongoose from 'mongoose';

// going: has a place · maybe · declined: can't go · waitlist: wanted to go while the event was full
export const RSVP_STATUSES = ['going', 'maybe', 'declined', 'waitlist'];

const { ObjectId } = mongoose.Schema.Types;

/**
 * One person's answer to one event — for a recurring event, to one occurrence of it.
 * eventId is always the single event or the series root (never an edited-occurrence document),
 * and occurrenceKey the occurrence's local date, so an answer survives an occurrence being edited.
 */
const rsvpSchema = new mongoose.Schema(
  {
    tenantId: { type: ObjectId, ref: 'Tenant', required: true },
    eventId: { type: ObjectId, ref: 'CalendarEvent', required: true },
    occurrenceKey: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    userId: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RSVP_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    // When the person took (or queued for) a place: decides who keeps a place and who leaves the waitlist first.
    queuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

rsvpSchema.index({ tenantId: 1, eventId: 1, occurrenceKey: 1, userId: 1 }, { unique: true });
rsvpSchema.index({ tenantId: 1, eventId: 1, occurrenceKey: 1, status: 1, queuedAt: 1 });
rsvpSchema.index({ tenantId: 1, userId: 1, eventId: 1 });

export default mongoose.model('CalendarRsvp', rsvpSchema);
