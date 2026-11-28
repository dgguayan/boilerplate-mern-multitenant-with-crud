import api from './axios.js';

export const getNotifications = (params) => api.get('/notifications', { params });
export const getUnreadCount = () => api.get('/notifications/unread-count');
export const markRead = (ids) => api.post('/notifications/read', { ids });
export const markAllRead = () => api.post('/notifications/read', { all: true });
