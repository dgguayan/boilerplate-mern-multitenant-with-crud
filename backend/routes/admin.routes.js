import { Router } from 'express';
import * as controller from '../controllers/admin.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import requireRole from '../middlewares/role.middleware.js';
import validate from '../middlewares/validate.middleware.js';

// User Management, Roles and Permissions, and Logs — administrators only.
const router = Router();
router.use(authMiddleware, tenantMiddleware, requireRole('admin', 'superadmin'));

router.get('/users', controller.listUsers);
router.post('/users', validate(controller.createUserSchema), controller.createUser);
router.put('/users/:id', validate(controller.updateUserSchema), controller.updateUser);

router.get('/roles', controller.listRoles);

router.get('/logs', controller.listLogs);
router.get('/logs/facets', controller.logFacets);
router.get('/logs/export', controller.exportLogs);

export default router;
