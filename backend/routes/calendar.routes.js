import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import * as controller from '../controllers/calendar.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import requireRole from '../middlewares/role.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  categorySchema,
  conflictsSchema,
  createEventSchema,
  resourceSchema,
  revertSchema,
  rsvpSchema,
  updateEventSchema,
} from '../validators/calendar.validators.js';

const router = Router();
const EDITORS = ['manager', 'admin', 'superadmin'];
const ADMINS = ['admin', 'superadmin'];

const importLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many imports. Please wait a few minutes and try again.' },
});

// 404 instead of a cast error for malformed ids
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ success: false, message: 'Not found' });
  next();
});

router.use(authMiddleware, tenantMiddleware);

router.get('/occurrences', controller.occurrences);

router.get('/events/:id', controller.getEvent);
router.get('/events/:id/ics', controller.eventIcs);
router.post('/events', requireRole(...EDITORS), validate(createEventSchema), controller.createEvent);
router.put('/events/:id', requireRole(...EDITORS), validate(updateEventSchema), controller.updateEvent);
router.delete('/events/:id', requireRole(...EDITORS), controller.deleteEvent);
router.post('/events/:id/duplicate', requireRole(...EDITORS), controller.duplicateEvent);
router.post('/revert', requireRole(...EDITORS), validate(revertSchema), controller.revert);
router.post('/conflicts', validate(conflictsSchema), controller.conflicts);

router.get('/events/:id/rsvp', controller.getRsvp);
router.put('/events/:id/rsvp', validate(rsvpSchema), controller.setRsvp);
router.get('/events/:id/attendees', controller.listAttendees);

router.get('/export', controller.exportCalendar);
router.post(
  '/import',
  requireRole(...EDITORS),
  importLimiter,
  express.text({ type: ['text/*', 'application/octet-stream'], limit: '2mb' }),
  controller.importCalendar
);

router.get('/categories', controller.listCategories);
router.post('/categories', requireRole(...ADMINS), validate(categorySchema), controller.saveCategory);
router.put('/categories/:id', requireRole(...ADMINS), validate(categorySchema), controller.saveCategory);
router.delete('/categories/:id', requireRole(...ADMINS), controller.deleteCategory);

router.get('/resources', controller.listResources);
router.post('/resources', requireRole(...ADMINS), validate(resourceSchema), controller.saveResource);
router.put('/resources/:id', requireRole(...ADMINS), validate(resourceSchema), controller.saveResource);
router.delete('/resources/:id', requireRole(...ADMINS), controller.deleteResource);

export default router;
