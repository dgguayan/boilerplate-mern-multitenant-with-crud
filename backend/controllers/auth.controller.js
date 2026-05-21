import * as authService from '../services/auth.service.js';
import * as apiResponse from '../utils/apiResponse.js';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    return apiResponse.created(res, { accessToken: result.accessToken, user: result.user }, 'Account created');
  } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    return apiResponse.success(res, { accessToken: result.accessToken, user: result.user }, 'Login successful');
  } catch (err) { next(err); }
};

export const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    const result = await authService.refresh(token);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
    return apiResponse.success(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) { next(err); }
};

export const logout = (_req, res) => {
  res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
  return apiResponse.success(res, {}, 'Logged out');
};

export const me = (req, res) => apiResponse.success(res, { user: req.user });
