import api from './axios.js';

// Public calendar: no sign-in needed. Only events a workspace published are returned.
export const getPublicEvents = (tenant, { start, end, category }) =>
  api.get(`/public/${tenant}/events`, { params: { start, end, category } });
export const getPublicEvent = (tenant, slug) => api.get(`/public/${tenant}/events/${slug}`);
