import mongoose from 'mongoose';

export const RESOURCE_TYPES = ['room', 'equipment', 'person', 'vehicle', 'other'];

// Rooms, equipment or people that events can be booked against (Resource scheduling view).
const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: RESOURCE_TYPES, default: 'room' },
    capacity: { type: Number, min: 0 },
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    // When true, events can't overlap on this resource: a clashing booking is refused.
    exclusive: { type: Boolean, default: false },
    description: { type: String, trim: true, maxlength: 300 },
    order: { type: Number, default: 0 },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

resourceSchema.index({ tenantId: 1, deleted: 1, order: 1 });

export default mongoose.model('CalendarResource', resourceSchema);
