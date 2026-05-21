import * as apiResponse from '../utils/apiResponse.js';

// Usage: requireRole('admin', 'superadmin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return apiResponse.error(res, 'Not authenticated', 401);
  }
  if (!roles.includes(req.user.role)) {
    return apiResponse.error(
      res,
      `Access denied. Required role: ${roles.join(' or ')}`,
      403
    );
  }
  next();
};

export default requireRole;
