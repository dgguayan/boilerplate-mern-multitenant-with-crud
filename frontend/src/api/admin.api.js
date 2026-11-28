import api from './axios.js';

export const getUsers = (params, signal) => api.get('/admin/users', { params, signal });
export const createUser = (data) => api.post('/admin/users', data);
export const updateUser = (id, data) => api.put(`/admin/users/${id}`, data);

export const getRoles = () => api.get('/admin/roles');

export const getLogs = (params, signal) => api.get('/admin/logs', { params, signal });
export const getLogFacets = () => api.get('/admin/logs/facets');
export const exportLogs = (params) => api.get('/admin/logs/export', { params, responseType: 'blob', timeout: 60000 });

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;
  if (data?.errors?.length) return data.errors.join(' ');
  return data?.message || fallback;
}
