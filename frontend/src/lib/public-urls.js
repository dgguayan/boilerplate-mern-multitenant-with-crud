// Addresses of the public calendar, as visitors and other calendar apps reach them.

const origin = () => window.location.origin;

/** The API's absolute address (VITE_API_URL may be a path like "/api" behind a proxy). */
export function apiOrigin() {
  const base = import.meta.env.VITE_API_URL || '/api';
  return new URL(base, origin()).href.replace(/\/$/, '');
}

export const publicCalendarUrl = (tenant) => `${origin()}/p/${tenant}`;

export function publicEventUrl(tenant, slug, occurrenceKey) {
  return `${origin()}/p/${tenant}/events/${slug}${occurrenceKey ? `?occurrence=${occurrenceKey}` : ''}`;
}

export const publicEventPath = (tenant, slug, occurrenceKey) =>
  `/p/${tenant}/events/${slug}${occurrenceKey ? `?occurrence=${occurrenceKey}` : ''}`;

/** Subscribe feed. Calendar apps poll it, so changes reach subscribers within hours. */
export const feedUrl = (tenant) => `${apiOrigin()}/public/${tenant}/calendar.ics`;
export const webcalUrl = (tenant) => feedUrl(tenant).replace(/^https?:/, 'webcal:');
export const googleSubscribeUrl = (tenant) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(tenant))}`;

export const eventIcsUrl = (tenant, slug, occurrenceKey) =>
  `${apiOrigin()}/public/${tenant}/events/${slug}/ics${occurrenceKey ? `?occurrence=${occurrenceKey}` : ''}`;

/** The widget page and the snippet that embeds it. */
export function embedUrl(tenant, { limit = 5, category, theme = 'auto' } = {}) {
  const params = new URLSearchParams({ limit: String(limit), theme });
  if (category) params.set('category', category);
  return `${origin()}/embed/${tenant}?${params}`;
}

export function embedCode(tenant, options = {}) {
  const height = 120 + (options.limit || 5) * 72;
  return `<iframe src="${embedUrl(tenant, options)}" title="Upcoming events" width="100%" height="${height}" style="border:0;max-width:480px" loading="lazy"></iframe>`;
}
