import * as apiResponse from '../utils/apiResponse.js';

// Attaches tenantFilter to req so every service call MUST scope by tenant.
// Must run AFTER authMiddleware.
const tenantMiddleware = (req, res, next) => {
  if (!req.user?.tenantId) {
    return apiResponse.error(res, 'Tenant context missing', 400);
  }
  // Convenience — spread this into every DB query
  req.tenantFilter = { tenantId: req.user.tenantId };
  next();
};

export default tenantMiddleware;
