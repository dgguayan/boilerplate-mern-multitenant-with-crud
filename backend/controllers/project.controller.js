import * as projectService from '../services/project.service.js';
import * as apiResponse from '../utils/apiResponse.js';

export const getAll = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await projectService.getAll({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100),
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
    return apiResponse.success(res, { project }, 'Project updated');
  } catch (err) { next(err); }
};

export const remove = async (req, res, next) => {
  try {
    await projectService.softDelete({
      id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role,
    });
    return apiResponse.success(res, {}, 'Project deleted');
  } catch (err) { next(err); }
};
