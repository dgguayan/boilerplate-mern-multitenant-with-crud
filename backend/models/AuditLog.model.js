import mongoose from 'mongoose';

export const LOG_CATEGORIES = ['auth', 'user', 'project', 'calendar', 'admin'];

// Entries expire automatically after AUDIT_LOG_RETENTION_DAYS (default one year).
export const RETENTION_DAYS =Math.max(1, parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) || 365);

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true, maxlength: 120 },
      email: { type: String, trim: true, maxlength: 200 },
      role: { type: String, maxlength: 20 },
    },
    action: { type: String, required: true, maxlength: 60 }, // e.g. "user.role_changed"
    category: { type: String, enum: LOG_CATEGORIES, required: true },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    summary: { type: String, maxlength: 300 },
    target: {
      type: { type: String, maxlength: 40 },
      id: { type: String, maxlength: 64 },
      label: { type: String, maxlength: 200 },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, category: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, 'actor.userId': 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86_400 });

export default mongoose.model('AuditLog', auditLogSchema);
