import * as authService from '../services/auth.service.js';
import * as apiResponse from '../utils/apiResponse.js';
import { audit, auditFailedLogin } from '../utils/audit.js';
import { verifyRefreshToken } from '../utils/jwt.js';
import User from '../models/User.model.js';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const actorOf = (user) => ({ userId: user.id, name: user.name, email: user.email, role: user.role });

export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    audit(req, {
      action: 'auth.registered',
      category: 'auth',
      summary: `${result.user.name} created an account`,
      actor: actorOf(result.user),
      tenantId: result.user.tenantId,
      target: { type: 'user', id: result.user.id, label: result.user.email },
    });
    return apiResponse.created(res, { accessToken: result.accessToken, user: result.user }, 'Account created');
  } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    audit(req, {
      action: 'auth.login',
      category: 'auth',
      summary: `${result.user.name} signed in`,
      actor: actorOf(result.user),
      tenantId: result.user.tenantId,
    });
    return apiResponse.success(res, { accessToken: result.accessToken, user: result.user }, 'Login successful');
  } catch (err) {
    if (err.status === 401) auditFailedLogin(req, req.body?.email);
    next(err);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    const result = await authService.refresh(token);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    return apiResponse.success(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) { next(err); }
};

export const logout = async (req, res) => {
  // Best effort: identify who is signing out from their refresh token.
  try {
    const { userId } = verifyRefreshToken(req.cookies?.refreshToken);
    const user = await User.findById(userId).select('name email role tenantId').lean();
    if (user) {
      audit(req, {
        action: 'auth.logout',
        category: 'auth',
        summary: `${user.name} signed out`,
        actor: { userId: user._id, name: user.name, email: user.email, role: user.role },
        tenantId: user.tenantId,
      });
    }
  } catch { /* no valid session — nothing to record */ }
  res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
  return apiResponse.success(res, {}, 'Logged out');
};

export const confirmPassword = async (req, res, next) => {
  try {
    await authService.confirmPassword(req.user.userId, req.body.password);
    return apiResponse.success(res, {}, 'Password confirmed');
  } catch (err) { next(err); }
};

export const me = (req, res) => apiResponse.success(res, { user: req.user });
