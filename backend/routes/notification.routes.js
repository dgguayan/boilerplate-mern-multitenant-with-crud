import { Router } from 'express';
import Joi from 'joi';
import * as controller from '../controllers/notification.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import validate from '../middlewares/validate.middleware.js';

const router = Router();

const readSchema = Joi.object({
  ids: Joi.array().items(Joi.string().hex().length(24)).max(100),
  all: Joi.boolean(),
}).or('ids', 'all');

router.use(authMiddleware, tenantMiddleware);
router.get('/', controller.list);
router.get('/unread-count', controller.count);
router.post('/read', validate(readSchema), controller.markRead);

export default router;
