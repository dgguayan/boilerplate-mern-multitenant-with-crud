/**
 * Loads every page of a paginated list, one request per page, for client-side tables.
 *
 * @param {(page: number) => Promise<{ items: any[], pages: number }>} fetchPage
 * @param {{ maxPages?: number }} [options]  safety stop against a server that never reports an end
 * @returns {Promise<any[]>}
 */
export async function fetchAllPages(fetchPage, { maxPages = 200 } = {}) {
  const items = [];
  for (let page = 1, pages = 1; page <= pages && page <= maxPages; page++) {
    const result = await fetchPage(page);
    items.push(...result.items);
    pages = Math.max(1, Number(result.pages) || 1);
  }
  return items;
}
