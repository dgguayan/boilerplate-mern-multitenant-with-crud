/**
 * Who may change a project. Anyone with create_project may edit; owners may always edit their own.
 * Deleting needs delete_project, and a manager may only delete projects they created.
 *
 * @param {object} project
 * @param {{ id: string, role: string } | null} user
 * @param {(permission: string) => boolean} can
 */
export function projectAccess(project, user, can) {
  const ownerId = project.createdBy?._id ?? project.createdBy;
  const isOwner = Boolean(user?.id) && ownerId === user.id;
  return {
    canEdit: can('create_project') || isOwner,
    canDelete: can('delete_project') && (user?.role !== 'manager' || isOwner),
  };
}
