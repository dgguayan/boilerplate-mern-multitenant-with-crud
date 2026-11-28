import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

import corsOptions from './config/cors.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import adminRoutes from './routes/admin.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

// ── Security headers ─────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1); // Required for rate limiting behind Render/Vercel proxy

// ── CORS ─────────────────────────────────────────────────
app.use(cors(corsOptions));

// ── Global rate limit ────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Parsers ───────────────────────────────────────────────
// Calendar events carry long descriptions and undo snapshots; everything else keeps the 10kb cap.
app.use('/api/calendar', express.json({ limit: '200kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// ── Error handler (must be last, 4 args) ─────────────────
app.use(errorMiddleware);

export default app;
