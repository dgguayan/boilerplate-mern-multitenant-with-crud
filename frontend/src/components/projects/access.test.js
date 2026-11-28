import { describe, expect, it } from 'vitest';
import { projectAccess } from './access.js';

const canAll = () => true;
const canNone = () => false;
const only = (...perms) => (p) => perms.includes(p);

describe('projectAccess', () => {
  const owner = { id: 'm1', role: 'manager' };
  const ownProject = { createdBy: { _id: 'm1' } };
  const otherProject = { createdBy: { _id: 'x9' } };

  it('lets owners edit their own projects without create_project', () => {
    expect(projectAccess(ownProject, owner, canNone).canEdit).toBe(true);
    expect(projectAccess(otherProject, owner, canNone).canEdit).toBe(false);
  });

  it('accepts createdBy as a bare id', () => {
    expect(projectAccess({ createdBy: 'm1' }, owner, canNone).canEdit).toBe(true);
  });

  it('limits managers to deleting their own projects', () => {
    expect(projectAccess(ownProject, owner, only('delete_project')).canDelete).toBe(true);
    expect(projectAccess(otherProject, owner, only('delete_project')).canDelete).toBe(false);
  });

  it('lets admins with delete_project delete any project', () => {
    expect(projectAccess(otherProject, { id: 'a1', role: 'admin' }, canAll).canDelete).toBe(true);
  });

  it('never treats a missing owner as owned when nobody is signed in', () => {
    expect(projectAccess({}, null, canNone)).toEqual({ canEdit: false, canDelete: false });
  });
});
