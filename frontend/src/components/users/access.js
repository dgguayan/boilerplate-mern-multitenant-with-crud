import { ROLE_META } from '@/components/admin/shared';

const rank = (role) => ROLE_META[role]?.rank || 0;

/**
 * What the signed-in person may do to a user row: manage people at or below their own rank,
 * and never deactivate or re-role themselves (the dialog and bulk actions both rely on this).
 */
export function userAccess(user, me) {
  const isSelf = String(user._id) === String(me?.id);
  return { isSelf, canManage: rank(user.role) <= rank(me?.role) };
}

/** Roles the signed-in person may hand out: their own rank and below. */
export const assignableRolesFor = (role, order) => order.filter((r) => rank(r) <= rank(role));

/**
 * Links name roles and statuses by key (/members?role=admin, from Roles & permissions); the table
 * filters on labels. Returns the params rewritten to labels, or null when nothing needs changing.
 */
export function labelLinkParams(searchParams) {
  const statusLabels = { active: 'Active', inactive: 'Inactive' };
  const next = new URLSearchParams(searchParams);
  const role = ROLE_META[searchParams.get('role')]?.label;
  const status = statusLabels[searchParams.get('status')];
  if (role) next.set('role', role);
  if (status) next.set('status', status);
  return role || status ? next : null;
}
