import mongoose from 'mongoose';

export const CATEGORY_ICONS = [
  'calendar', 'users', 'presentation', 'graduation-cap', 'briefcase', 'party-popper',
  'heart-pulse', 'megaphone', 'video', 'map-pin', 'trophy', 'music', 'utensils',
  'plane', 'wrench', 'star',
];

// public: may appear on public pages · restricted: signed-in tenant members · private: admins only
export const VISIBILITIES = ['public', 'restricted', 'private'];

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    icon: { type: String, enum: CATEGORY_ICONS, default: 'calendar' },
    description: { type: String, trim: true, maxlength: 300 },
    visibility: { type: String, enum: VISIBILITIES, default: 'restricted' },
    order: { type: Number, default: 0 },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

categorySchema.index({ tenantId: 1, deleted: 1, order: 1 });

export default mongoose.model('CalendarCategory', categorySchema);
