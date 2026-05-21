import { verifyAccessToken } from '../utils/jwt.js';
import * as apiResponse from '../utils/apiResponse.js';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return apiResponse.error(res, 'Access token required', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      name: decoded.name,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return apiResponse.error(res, 'Access token expired', 401);
    }
    return apiResponse.error(res, 'Invalid access token', 401);
  }
};

export default authMiddleware;
