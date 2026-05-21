import logger from '../utils/logger.js';

// Must be registered LAST in app.js with 4 params
const errorMiddleware = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    logger.error({ message, stack: err.stack, path: req.path, method: req.method });
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorMiddleware;
