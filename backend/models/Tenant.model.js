import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    isActive: { type: Boolean, default: true },
    settings: {
      maxUsers: { type: Number, default: 5 },
      maxProjects: { type: Number, default: 10 },
    },
    // Public event pages, the embeddable widget and the subscribe feed. Off until an admin turns it on;
    // even then only events marked "public" (in a public or no category) are shown.
    publicCalendar: {
      enabled: { type: Boolean, default: false },
      enabledAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Tenant', tenantSchema);
