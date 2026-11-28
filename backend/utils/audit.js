import AuditLog from '../models/AuditLog.model.js';
import User from '../models/User.model.js';
import logger from './logger.js';

const clientInfo = (req) => ({
  ip: req.ip,
  userAgent: req.get?.('user-agent')?.slice(0, 300),
});

/**
 * Records an activity in the tenant's log. Fire-and-forget: a logging failure never breaks
 * the request it describes. Never pass secrets (passwords, tokens) in `metadata`.
 *
 *   audit(req, { action: 'project.created', category: 'project', target: { type: 'project', id, label }, summary })
 */
export function audit(req, { action, category, summary, target, metadata, status = 'success', actor, tenantId }) {
  const who = actor || (req.user && { userId: req.user.userId, name: req.user.name, role: req.user.role });
  const tenant = tenantId || req.user?.tenantId;
  if (!tenant) return;
  AuditLog.create({
    tenantId: tenant,
    actor: who,
    action,
    category,
    status,
    summary: summary?.slice(0, 300),
    target: target && { ...target, id: target.id && String(target.id), label: target.label?.slice(0, 200) },
    metadata,
    ...clientInfo(req),
  }).catch((err) => logger.error({ message: 'Audit log write failed', error: err.message, action }));
}

/** Failed sign-in: logged in every workspace that has an account with this email. */
export function auditFailedLogin(req, email) {
  if (!email) return;
  User.find({ email: String(email).toLowerCase() })
    .select('tenantId name role')
    .lean()
    .then((users) => {
      for (const user of users) {
        audit(req, {
          action: 'auth.login_failed',
          category: 'auth',
          status: 'failure',
          summary: `Failed sign-in attempt for ${email}`,
          actor: { userId: user._id, name: user.name, email, role: user.role },
          tenantId: user.tenantId,
          target: { type: 'user', id: user._id, label: email },
        });
      }
    })
    .catch((err) => logger.error({ message: 'Audit lookup failed', error: err.message }));
}
