import Project from '../models/Project.model.js';

const BASE_FILTER = (tenantId) => ({ tenantId, deleted: false });

export const getAll = async ({ tenantId, userId, role, page = 1, limit = 20, status }) => {
  const filter = BASE_FILTER(tenantId);

  // 'user' role can only see their own projects
  if (role === 'user') filter.createdBy = userId;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Project.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Project.countDocuments(filter),
  ]);

  return {
    data: docs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

export const getById = async ({ id, tenantId, userId, role }) => {
  const filter = { _id: id, ...BASE_FILTER(tenantId) };
  if (role === 'user') filter.createdBy = userId;

  const project = await Project.findOne(filter)
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();

  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  return project;
};

export const create = async ({ tenantId, userId, data }) => {
  return Project.create({ ...data, tenantId, createdBy: userId });
};

export const update = async ({ id, tenantId, userId, role, data }) => {
  const filter = { _id: id, ...BASE_FILTER(tenantId) };
  // 'user' can only update their own
  if (role === 'user') filter.createdBy = userId;

  const project = await Project.findOneAndUpdate(
    filter,
    { ...data, updatedBy: userId },
    { new: true, runValidators: true }
  );

  if (!project) throw Object.assign(new Error('Project not found or access denied'), { status: 404 });
  return project;
};

export const softDelete = async ({ id, tenantId, userId, role }) => {
  const filter = { _id: id, ...BASE_FILTER(tenantId) };
  // Only managers+ can delete any; users cannot delete
  if (role === 'user') throw Object.assign(new Error('Access denied'), { status: 403 });
  // Managers can only delete their own
  if (role === 'manager') filter.createdBy = userId;

  const project = await Project.findOneAndUpdate(
    filter,
    { deleted: true, deletedAt: new Date(), deletedBy: userId },
    { new: true }
  );

  if (!project) throw Object.assign(new Error('Project not found or access denied'), { status: 404 });
  return project;
};
