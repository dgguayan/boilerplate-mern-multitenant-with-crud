// Per-viewer table layout (column visibility, order, widths, pinning, page size, density),
// remembered in this browser. Storage can be unavailable (private windows, blocked site data),
// so every read and write is guarded and the table works without it.

const PREFIX = 'data-table:';
export const PREF_KEYS = ['columnVisibility', 'columnOrder', 'columnSizing', 'columnPinning', 'pageSize', 'density'];

export function loadTablePrefs(storageKey) {
  if (!storageKey) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFIX + storageKey) || '{}');
    return parsed && typeof parsed === 'object' ? pick(parsed) : {};
  } catch {
    return {};
  }
}

export function saveTablePrefs(storageKey, prefs) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(PREFIX + storageKey, JSON.stringify(pick(prefs)));
  } catch {
    // ignore: preferences are a convenience
  }
}

export function clearTablePrefs(storageKey) {
  if (!storageKey) return;
  try {
    window.localStorage.removeItem(PREFIX + storageKey);
  } catch {
    // ignore
  }
}

function pick(source) {
  return Object.fromEntries(PREF_KEYS.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}

/**
 * Drops saved column ids that no longer exist, so a renamed or removed column cannot break the table.
 * @param {object} prefs
 * @param {string[]} columnIds  the table's current leaf column ids
 */
export function sanitizeTablePrefs(prefs, columnIds) {
  const known = new Set(columnIds);
  const out = { ...prefs };
  if (out.columnVisibility) {
    out.columnVisibility = Object.fromEntries(Object.entries(out.columnVisibility).filter(([id]) => known.has(id)));
  }
  if (out.columnSizing) {
    out.columnSizing = Object.fromEntries(
      Object.entries(out.columnSizing).filter(([id, size]) => known.has(id) && Number.isFinite(size)),
    );
  }
  if (Array.isArray(out.columnOrder)) {
    const kept = out.columnOrder.filter((id) => known.has(id));
    // columns added since the order was saved go at the end
    out.columnOrder = kept.length ? [...kept, ...columnIds.filter((id) => !kept.includes(id))] : undefined;
  }
  if (out.columnPinning) {
    const start = (out.columnPinning.start || []).filter((id) => known.has(id));
    const end = (out.columnPinning.end || []).filter((id) => known.has(id));
    out.columnPinning = { start, end };
  }
  if (out.pageSize !== undefined && ![5, 10, 20, 50].includes(out.pageSize)) delete out.pageSize;
  if (out.density !== undefined && !['compact', 'comfortable', 'spacious'].includes(out.density)) delete out.density;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}
