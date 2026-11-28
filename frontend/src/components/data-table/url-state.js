// Table search and filters <-> URL search params, so a filtered view can be bookmarked or shared.
//
//   ?q=<search>&<columnId>=<value>
//
// String values are written as they are; objects and arrays (month/year, number ranges) as JSON.

export const SEARCH_PARAM = 'q';

const encodeValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

function decodeValue(raw) {
  if (/^[[{]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const isEmpty = (value) =>
  value == null ||
  value === '' ||
  (Array.isArray(value) && value.every((v) => v === '' || v == null)) ||
  (typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => v === undefined));

/** Reads the search text and the filters of the given columns from the params. */
export function readTableUrlState(params, filterableIds) {
  const columnFilters = [];
  for (const id of filterableIds) {
    const raw = params.get(id);
    if (raw == null || raw === '') continue;
    const value = decodeValue(raw);
    if (!isEmpty(value)) columnFilters.push({ id, value });
  }
  return { globalFilter: params.get(SEARCH_PARAM) ?? '', columnFilters };
}

/** Writes the search text and filters into a copy of the params; params of other names are kept. */
export function writeTableUrlState(params, filterableIds, { globalFilter, columnFilters }) {
  const next = new URLSearchParams(params);
  if (globalFilter) next.set(SEARCH_PARAM, globalFilter);
  else next.delete(SEARCH_PARAM);
  for (const id of filterableIds) {
    const filter = columnFilters.find((f) => f.id === id);
    if (filter && !isEmpty(filter.value)) next.set(id, encodeValue(filter.value));
    else next.delete(id);
  }
  return next;
}

/** Stable key for comparing two table states without caring about filter order. */
export function tableUrlStateKey({ globalFilter, columnFilters }) {
  const filters = columnFilters
    .filter((f) => !isEmpty(f.value))
    .map((f) => `${f.id}=${encodeValue(f.value)}`)
    .sort();
  return JSON.stringify([globalFilter || '', filters]);
}
