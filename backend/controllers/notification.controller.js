import Joi from 'joi';
import * as notifications from '../services/notification.service.js';
import * as apiResponse from '../utils/apiResponse.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const listQuery = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(20),
  before: Joi.date().iso(),
});

export const list = handle(async (req, res) => {
  const { value, error } = listQuery.validate(req.query, { stripUnknown: true });
  if (error) return apiResponse.error(res, error.details[0].message.replace(/"/g, "'"), 422);
  return apiResponse.success(res, await notifications.listNotifications({ user: req.user, ...value }));
});

export const count = handle(async (req, res) =>
  apiResponse.success(res, { unread: await notifications.unreadCount(req.user) })
);

export const markRead = handle(async (req, res) => {
  const updated = await notifications.markRead({ user: req.user, ids: req.body.ids, all: req.body.all });
  return apiResponse.success(res, { updated, unread: await notifications.unreadCount(req.user) });
});
