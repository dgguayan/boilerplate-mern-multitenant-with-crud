import { Router } from 'express';
import Joi from 'joi';
import * as projectController from '../controllers/project.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import requireRole from '../middlewares/role.middleware.js';
import validate from '../middlewares/validate.middleware.js';

const router = Router();

const createSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  status: Joi.string().valid('active', 'inactive', 'archived').default('active'),
});

const updateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120),
  description: Joi.string().trim().max(1000).allow('', null),
  status: Joi.string().valid('active', 'inactive', 'archived'),
}).min(1); // At least one field required

// All routes require auth + tenant context
router.use(authMiddleware, tenantMiddleware);

router.get('/', projectController.getAll);
router.get('/:id', projectController.getById);
router.post('/', requireRole('manager', 'admin', 'superadmin'), validate(createSchema), projectController.create);
router.put('/:id', validate(updateSchema), projectController.update);
router.delete('/:id', requireRole('manager', 'admin', 'superadmin'), projectController.remove);

export default router;
