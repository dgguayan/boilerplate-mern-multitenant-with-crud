import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '@/components/admin/shared';
import { assignableRolesFor, labelLinkParams, userAccess } from './access.js';

const admin = { id: 'a1', role: 'admin' };

describe('userAccess', () => {
  it('lets people manage their own rank and below, not above', () => {
    expect(userAccess({ _id: 'u1', role: 'user' }, admin).canManage).toBe(true);
    expect(userAccess({ _id: 'u2', role: 'admin' }, admin).canManage).toBe(true);
    expect(userAccess({ _id: 'u3', role: 'superadmin' }, admin).canManage).toBe(false);
  });

  it('marks the signed-in person as self', () => {
    expect(userAccess({ _id: 'a1', role: 'admin' }, admin).isSelf).toBe(true);
    expect(userAccess({ _id: 'u1', role: 'user' }, admin).isSelf).toBe(false);
  });

  it('gives nothing to someone not signed in', () => {
    expect(userAccess({ _id: 'u1', role: 'user' }, null)).toEqual({ isSelf: false, canManage: false });
  });
});

describe('assignableRolesFor', () => {
  it('offers roles at or below the given role', () => {
    expect(assignableRolesFor('manager', ROLE_ORDER)).toEqual(['manager', 'user']);
    expect(assignableRolesFor('superadmin', ROLE_ORDER)).toEqual(ROLE_ORDER);
    expect(assignableRolesFor(undefined, ROLE_ORDER)).toEqual([]);
  });
});

describe('labelLinkParams', () => {
  it('rewrites role and status keys from links into table labels', () => {
    expect(labelLinkParams(new URLSearchParams('role=superadmin&status=inactive&q=x')).toString()).toBe(
      'role=Super+admin&status=Inactive&q=x',
    );
  });

  it('returns null when nothing needs rewriting', () => {
    expect(labelLinkParams(new URLSearchParams('role=Manager'))).toBeNull();
    expect(labelLinkParams(new URLSearchParams(''))).toBeNull();
  });
});
