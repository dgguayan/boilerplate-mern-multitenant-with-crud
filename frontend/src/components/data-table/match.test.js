import { describe, expect, it } from 'vitest';
import { matchesMonthYear } from './match.js';

describe('matchesMonthYear', () => {
  const march2026 = new Date(2026, 2, 15).toISOString();

  it('matches on month, year, or both', () => {
    expect(matchesMonthYear(march2026, { month: 2 })).toBe(true);
    expect(matchesMonthYear(march2026, { year: 2026 })).toBe(true);
    expect(matchesMonthYear(march2026, { month: 2, year: 2026 })).toBe(true);
    expect(matchesMonthYear(march2026, { month: 3 })).toBe(false);
    expect(matchesMonthYear(march2026, { month: 2, year: 2025 })).toBe(false);
  });

  it('never matches a missing or invalid date', () => {
    expect(matchesMonthYear(null, { year: 2026 })).toBe(false);
    expect(matchesMonthYear('not a date', { year: 2026 })).toBe(false);
  });
});
