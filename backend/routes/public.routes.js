import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/public.controller.js';

// No sign-in: everything here is read-only and limited to events a workspace chose to publish.
const router = Router();

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again in a minute.' },
  })
);

const SLUG = '[a-z0-9-]{1,80}';
router.get(`/:tenant(${SLUG})/events`, controller.listEvents);
router.get(`/:tenant(${SLUG})/events/:slug(${SLUG})`, controller.getEvent);
router.get(`/:tenant(${SLUG})/events/:slug(${SLUG})/ics`, controller.eventIcs);
router.get(`/:tenant(${SLUG})/calendar.ics`, controller.feed);

export default router;
