import { describe, expect, it } from 'vitest';
import { readTableUrlState, tableUrlStateKey, writeTableUrlState } from './url-state.js';

const IDS = ['role', 'status', 'createdAt', 'budget'];

describe('table URL state', () => {
  it('reads search text, plain values and JSON values', () => {
    const params = new URLSearchParams('q=maria&role=Manager&createdAt={"month":2,"year":2026}&budget=["10","500"]&other=x');
    expect(readTableUrlState(params, IDS)).toEqual({
      globalFilter: 'maria',
      columnFilters: [
        { id: 'role', value: 'Manager' },
        { id: 'createdAt', value: { month: 2, year: 2026 } },
        { id: 'budget', value: ['10', '500'] },
      ],
    });
  });

  it('ignores params of columns that are not filterable', () => {
    expect(readTableUrlState(new URLSearchParams('name=bob'), IDS).columnFilters).toEqual([]);
  });

  it('keeps a value that only looks like JSON as text', () => {
    expect(readTableUrlState(new URLSearchParams('role=[oops'), IDS).columnFilters).toEqual([{ id: 'role', value: '[oops' }]);
  });

  it('round-trips through write and read', () => {
    const state = {
      globalFilter: 'acme',
      columnFilters: [
        { id: 'status', value: 'Active' },
        { id: 'createdAt', value: { year: 2025 } },
      ],
    };
    const written = writeTableUrlState(new URLSearchParams(), IDS, state);
    expect(readTableUrlState(written, IDS)).toEqual(state);
  });

  it('removes cleared filters and keeps unrelated params', () => {
    const before = new URLSearchParams('q=x&role=Admin&tab=2');
    const after = writeTableUrlState(before, IDS, { globalFilter: '', columnFilters: [] });
    expect(after.toString()).toBe('tab=2');
  });

  it('treats empty filter values as no filter', () => {
    const written = writeTableUrlState(new URLSearchParams(), IDS, {
      globalFilter: '',
      columnFilters: [
        { id: 'budget', value: ['', ''] },
        { id: 'createdAt', value: { month: undefined, year: undefined } },
      ],
    });
    expect(written.toString()).toBe('');
  });

  it('compares states regardless of filter order', () => {
    const a = { globalFilter: 'x', columnFilters: [{ id: 'role', value: 'Admin' }, { id: 'status', value: 'Active' }] };
    const b = { globalFilter: 'x', columnFilters: [{ id: 'status', value: 'Active' }, { id: 'role', value: 'Admin' }] };
    expect(tableUrlStateKey(a)).toBe(tableUrlStateKey(b));
    expect(tableUrlStateKey(a)).not.toBe(tableUrlStateKey({ ...b, globalFilter: 'y' }));
  });
});
