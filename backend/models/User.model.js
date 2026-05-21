import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const ROLES = ['superadmin', 'admin', 'manager', 'user'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// Unique email per tenant (not globally)
userSchema.index({ email: 1, tenantId: 1 }, { unique: true });

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.ROLES = ROLES;

export default mongoose.model('User', userSchema);
