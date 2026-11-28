import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
import logger from './utils/logger.js';
import { startReminderJob } from './services/notification.service.js';

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
  // Event reminders for people going to events starting within 24 hours.
  if (process.env.REMINDERS !== 'off') startReminderJob();
})();
