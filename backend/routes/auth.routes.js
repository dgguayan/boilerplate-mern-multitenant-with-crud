import { Router } from 'express';
import Joi from 'joi';
import { rateLimit } from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(72).required(),
  tenantSlug: Joi.string().lowercase().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  tenantSlug: Joi.string().lowercase().required(),
});

const confirmPasswordSchema = Joi.object({
  password: Joi.string().required(),
});

router.post('/register', loginLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/confirm-password', authMiddleware, validate(confirmPasswordSchema), authController.confirmPassword);
router.get('/me', authMiddleware, authController.me);

export default router;
