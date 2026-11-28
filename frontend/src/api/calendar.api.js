import api from './axios.js';

const base = '/calendar';

export const getOccurrences = ({ start, end }, signal) =>
  api.get(`${base}/occurrences`, { params: { start, end }, signal, timeout: 20000 });
export const getEvent = (id, { countView = false } = {}) =>
  api.get(`${base}/events/${id}`, { params: countView ? { view: 1 } : undefined });
export const createEvent = (data) => api.post(`${base}/events`, data);
export const updateEvent = (id, { scope = 'all', occurrenceKey, data }) =>
  api.put(`${base}/events/${id}`, { scope, occurrenceKey, data });
export const deleteEvent = (id, { scope = 'all', occurrenceKey } = {}) =>
  api.delete(`${base}/events/${id}`, { params: { scope, occurrence: occurrenceKey } });
export const duplicateEvent = (id) => api.post(`${base}/events/${id}/duplicate`);
export const revertChanges = (changes) => api.post(`${base}/revert`, { changes });
export const checkConflicts = (payload, signal) => api.post(`${base}/conflicts`, payload, { signal });

// Replies. `occurrence` (yyyy-mm-dd) picks one occurrence of a recurring event.
export const getRsvp = (id, occurrence) => api.get(`${base}/events/${id}/rsvp`, { params: { occurrence } });
export const setRsvp = (id, { status, occurrence, note }) => api.put(`${base}/events/${id}/rsvp`, { status, occurrence, note });
export const getAttendees = (id, occurrence) => api.get(`${base}/events/${id}/attendees`, { params: { occurrence } });

// Insights for organizers: counts over [start, end) in the viewer's time zone.
export const getAnalytics = ({ start, end, tz }) => api.get(`${base}/analytics`, { params: { start, end, tz }, timeout: 30000 });

// Public calendar switch and the workspace's public address.
export const getSharing = () => api.get(`${base}/sharing`);
export const setSharing = (publicEnabled) => api.put(`${base}/sharing`, { publicEnabled });

export const getCategories = () => api.get(`${base}/categories`);
export const saveCategory = (id, data) => (id ? api.put(`${base}/categories/${id}`, data) : api.post(`${base}/categories`, data));
export const deleteCategory = (id) => api.delete(`${base}/categories/${id}`);

export const getResources = () => api.get(`${base}/resources`);
export const saveResource = (id, data) => (id ? api.put(`${base}/resources/${id}`, data) : api.post(`${base}/resources`, data));
export const deleteResource = (id) => api.delete(`${base}/resources/${id}`);

export const downloadEventIcs = (id, occurrenceKey) =>
  api.get(`${base}/events/${id}/ics`, { params: { occurrence: occurrenceKey }, responseType: 'blob' });
export const exportCalendar = ({ format, start, end }) =>
  api.get(`${base}/export`, { params: { format, start, end }, responseType: 'blob', timeout: 60000 });
export const importCalendar = ({ format, timeZone, text }) =>
  api.post(`${base}/import`, text, {
    params: { format, timeZone },
    headers: { 'Content-Type': format === 'csv' ? 'text/csv' : 'text/calendar' },
    timeout: 60000,
  });

/** Readable message from an API error. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;
  if (data?.errors?.length) return data.errors.join(' ');
  return data?.message || (err?.code === 'ECONNABORTED' ? 'The server took too long to respond.' : fallback);
}

/** Saves a blob response as a file. */
export function saveBlob(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || '';
  const name = disposition.match(/filename="?([^"]+)"?/)?.[1] || fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
