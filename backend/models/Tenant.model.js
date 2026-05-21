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
  },
  { timestamps: true }
);

export default mongoose.model('Tenant', tenantSchema);
