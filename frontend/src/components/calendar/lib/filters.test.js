import { describe, expect, it } from 'vitest';
import { applyFilters, EMPTY_FILTERS, matchesRsvp } from './filters.js';

describe('matchesRsvp', () => {
  it("counts the waitlist as going for “I'm going”", () => {
    expect(matchesRsvp('going', 'going')).toBe(true);
    expect(matchesRsvp('waitlist', 'going')).toBe(true);
    expect(matchesRsvp('maybe', 'going')).toBe(false);
    expect(matchesRsvp(null, 'going')).toBe(false);
  });

  it('splits replied from not replied', () => {
    for (const reply of ['going', 'maybe', 'declined', 'waitlist']) {
      expect(matchesRsvp(reply, 'replied')).toBe(true);
      expect(matchesRsvp(reply, 'unanswered')).toBe(false);
    }
    expect(matchesRsvp(null, 'unanswered')).toBe(true);
    expect(matchesRsvp(undefined, 'any')).toBe(true);
  });
});

describe('applyFilters with the reply filter', () => {
  const occ = (id, myRsvp) => ({ id, title: `Event ${id}`, start: '2026-12-01T10:00:00Z', end: '2026-12-01T11:00:00Z', status: 'published', myRsvp });
  const list = [occ('a', 'going'), occ('b', null), occ('c', 'waitlist'), occ('d', 'declined')];
  const ids = (filters) => applyFilters(list, { ...EMPTY_FILTERS, ...filters }, new Map()).map((o) => o.id);

  it('keeps only matching occurrences', () => {
    expect(ids({ rsvp: 'going' })).toEqual(['a', 'c']);
    expect(ids({ rsvp: 'unanswered' })).toEqual(['b']);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('tolerates filters saved before the reply filter existed', () => {
    const { rsvp, ...older } = EMPTY_FILTERS;
    expect(applyFilters(list, older, new Map())).toHaveLength(4);
  });
});
