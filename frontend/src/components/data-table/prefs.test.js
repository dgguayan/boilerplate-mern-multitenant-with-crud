import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTablePrefs, loadTablePrefs, sanitizeTablePrefs, saveTablePrefs } from './prefs.js';

function stubStorage() {
  const store = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('table preferences', () => {
  it('saves and loads only the layout keys', () => {
    stubStorage();
    saveTablePrefs('users', { pageSize: 20, density: 'spacious', columnFilters: [{ id: 'x' }] });
    expect(loadTablePrefs('users')).toEqual({ pageSize: 20, density: 'spacious' });
  });

  it('keeps tables apart by key and clears one', () => {
    stubStorage();
    saveTablePrefs('users', { pageSize: 20 });
    saveTablePrefs('projects', { pageSize: 50 });
    clearTablePrefs('users');
    expect(loadTablePrefs('users')).toEqual({});
    expect(loadTablePrefs('projects')).toEqual({ pageSize: 50 });
  });

  it('works without storage and with broken saved data', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(loadTablePrefs('users')).toEqual({});
    expect(() => saveTablePrefs('users', { pageSize: 5 })).not.toThrow();

    const store = stubStorage();
    store.set('data-table:users', '{not json');
    expect(loadTablePrefs('users')).toEqual({});
  });

  it('drops columns that no longer exist and appends new ones to a saved order', () => {
    const ids = ['select', 'name', 'email', 'role', 'actions'];
    expect(
      sanitizeTablePrefs(
        {
          columnVisibility: { email: false, removed: false },
          columnSizing: { name: 300, removed: 90, role: 'wide' },
          columnOrder: ['name', 'removed', 'select'],
          columnPinning: { start: ['select', 'removed'], end: ['actions'] },
          pageSize: 7,
          density: 'tiny',
        },
        ids,
      ),
    ).toEqual({
      columnVisibility: { email: false },
      columnSizing: { name: 300 },
      columnOrder: ['name', 'select', 'email', 'role', 'actions'],
      columnPinning: { start: ['select'], end: ['actions'] },
    });
  });
});
