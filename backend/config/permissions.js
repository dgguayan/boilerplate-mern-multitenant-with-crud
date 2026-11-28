/**
 * Roles and what each one may do.
 *
 * This is a description of the rules the API enforces (route guards in routes/*.routes.js and
 * ownership checks in services/*). It powers the read-only "Roles and Permissions" page.
 * If you change a rule in a route or service, update the matching entry here.
 *
 * Access levels:  all = any record in the workspace · own = only records they created · none
 */

export const ROLE_RANK = { user: 1, manager: 2, admin: 3, superadmin: 4 };

export const ROLES = [
  {
    key: 'superadmin',
    name: 'Super admin',
    description: 'Full control of the workspace, including other administrators.',
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Manages users, workspace settings, categories and resources, and can edit any record.',
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Creates projects and events and manages the records they own.',
  },
  {
    key: 'user',
    name: 'User',
    description: 'Works with their own projects and views shared calendars and documents.',
  },
].map((role) => ({ ...role, rank: ROLE_RANK[role.key] }));

const all = { superadmin: 'all', admin: 'all', manager: 'all', user: 'all' };
const adminsOnly = { superadmin: 'all', admin: 'all', manager: 'none', user: 'none' };

export const PERMISSIONS = [
  {
    module: 'Projects',
    actions: [
      { key: 'projects.view', label: 'View projects', access: { ...all, user: 'own' } },
      { key: 'projects.create', label: 'Create projects', access: { ...all, user: 'none' } },
      { key: 'projects.edit', label: 'Edit projects', access: { ...all, user: 'own' } },
      { key: 'projects.delete', label: 'Delete projects', access: { superadmin: 'all', admin: 'all', manager: 'own', user: 'none' } },
    ],
  },
  {
    module: 'Calendar',
    actions: [
      { key: 'calendar.view', label: 'View events', access: all, note: 'Private events and drafts are visible to their creator and administrators only.' },
      { key: 'calendar.create', label: 'Create and import events', access: { ...all, user: 'none' } },
      { key: 'calendar.edit', label: 'Edit, reschedule and delete events', access: { superadmin: 'all', admin: 'all', manager: 'own', user: 'none' } },
      { key: 'calendar.export', label: 'Export events', access: all },
      { key: 'calendar.rsvp', label: 'Reply to events (going, maybe, can’t go)', access: all, note: 'Only to events they can see, before the event starts and its registration deadline.' },
      { key: 'calendar.attendees', label: 'See who replied to an event', access: { superadmin: 'all', admin: 'all', manager: 'own', user: 'none' } },
      { key: 'calendar.manage', label: 'Manage categories and resources', access: adminsOnly },
      { key: 'calendar.share', label: 'Turn the public calendar on or off', access: adminsOnly, note: 'Public pages show only events marked public, in a public category or none.' },
    ],
  },
  {
    module: 'Documents',
    actions: [{ key: 'documents.view', label: 'Preview and download documents', access: all }],
  },
  {
    module: 'Administration',
    actions: [
      { key: 'users.manage', label: 'Manage users and assign roles', access: adminsOnly, note: 'Administrators can assign roles up to their own; only super admins can manage super admins.' },
      { key: 'roles.view', label: 'View roles and permissions', access: adminsOnly },
      { key: 'logs.view', label: 'View and export logs', access: adminsOnly },
    ],
  },
];

export const rank = (role) => ROLE_RANK[role] || 0;
