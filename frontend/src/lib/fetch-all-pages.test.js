import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './fetch-all-pages.js';

describe('fetchAllPages', () => {
  it('requests every page the server reports and joins the items in order', async () => {
    const fetchPage = vi.fn(async (page) => ({ items: [`a${page}`, `b${page}`], pages: 3 }));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
  });

  it('makes a single request when the server reports no page count', async () => {
    const fetchPage = vi.fn(async () => ({ items: [1] }));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops at maxPages', async () => {
    const fetchPage = vi.fn(async (page) => ({ items: [page], pages: 1e9 }));
    await expect(fetchAllPages(fetchPage, { maxPages: 4 })).resolves.toEqual([1, 2, 3, 4]);
  });

  it('passes a failed request on to the caller', async () => {
    const fetchPage = async (page) => {
      if (page === 2) throw new Error('boom');
      return { items: [page], pages: 3 };
    };
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('boom');
  });
});
