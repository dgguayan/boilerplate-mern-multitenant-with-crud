import { Router } from 'express';
import Joi from 'joi';
import * as projectController from '../controllers/project.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import requireRole from '../middlewares/role.middleware.js';
import validate from '../middlewares/validate.middleware.js';

const router = Router();

const optionalFields = {
  description: Joi.string().trim().max(1000).allow('', null),
  code: Joi.string().trim().max(40).allow('', null),
  client: Joi.string().trim().max(120).allow('', null),
  category: Joi.string().valid('development', 'design', 'marketing', 'infrastructure', 'research').allow(null),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  budget: Joi.number().min(0),
  spent: Joi.number().min(0),
  startDate: Joi.date().allow(null),
  dueDate: Joi.date().allow(null),
};

const createSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  status: Joi.string().valid('active', 'inactive', 'archived').default('active'),
  ...optionalFields,
});

const updateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120),
  status: Joi.string().valid('active', 'inactive', 'archived'),
  ...optionalFields,
}).min(1); // At least one field required

// All routes require auth + tenant context
router.use(authMiddleware, tenantMiddleware);

router.get('/', projectController.getAll);
router.get('/:id', projectController.getById);
router.post('/', requireRole('manager', 'admin', 'superadmin'), validate(createSchema), projectController.create);
router.put('/:id', validate(updateSchema), projectController.update);
router.delete('/:id', requireRole('manager', 'admin', 'superadmin'), projectController.remove);

export default router;
