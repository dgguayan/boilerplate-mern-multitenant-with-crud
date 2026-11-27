import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
    code: { type: String, trim: true, maxlength: 40 },
    client: { type: String, trim: true, maxlength: 120 },
    category: {
      type: String,
      enum: ['development', 'design', 'marketing', 'infrastructure', 'research'],
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    budget: { type: Number, min: 0, default: 0 },
    spent: { type: Number, min: 0, default: 0 },
    startDate: { type: Date },
    dueDate: { type: Date },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Soft delete
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound index for all tenant-scoped queries
projectSchema.index({ tenantId: 1, deleted: 1, createdAt: -1 });

export default mongoose.model('Project', projectSchema);
