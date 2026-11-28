import * as projectService from '../services/project.service.js';
import * as apiResponse from '../utils/apiResponse.js';
import { audit } from '../utils/audit.js';

export const getAll = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await projectService.getAll({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 1000),
      status,
    });
    return apiResponse.paginated(res, result.data, result.pagination);
  } catch (err) { next(err); }
};

export const getById = async (req, res, next) => {
  try {
    const project = await projectService.getById({
      id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
    });
    return apiResponse.success(res, { project });
  } catch (err) { next(err); }
};

export const create = async (req, res, next) => {
  try {
    const project = await projectService.create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      data: req.body,
    });
    audit(req, { action: 'project.created', category: 'project', summary: `Created project “${project.title}”`, target: { type: 'project', id: project._id, label: project.title } });
    return apiResponse.created(res, { project }, 'Project created');
  } catch (err) { next(err); }
};

export const update = async (req, res, next) => {
  try {
    const project = await projectService.update({
      id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
      data: req.body,
    });
    audit(req, {
      action: 'project.updated',
      category: 'project',
      summary: `Updated project “${project.title}”`,
      target: { type: 'project', id: project._id, label: project.title },
      metadata: { fields: Object.keys(req.body) },
    });
    return apiResponse.success(res, { project }, 'Project updated');
  } catch (err) { next(err); }
};

export const remove = async (req, res, next) => {
  try {
    const project = await projectService.softDelete({
      id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
    });
    audit(req, { action: 'project.deleted', category: 'project', summary: `Deleted project “${project.title}”`, target: { type: 'project', id: project._id, label: project.title } });
    return apiResponse.success(res, {}, 'Project deleted');
  } catch (err) { next(err); }
};
