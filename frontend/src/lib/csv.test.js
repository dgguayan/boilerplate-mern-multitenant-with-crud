import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

describe('csvCell', () => {
  it('quotes and escapes quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1 555')).toBe('"\'+1 555"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('-42')).toBe('"-42"');
    expect(csvCell('-3.5')).toBe('"-3.5"');
  });

  it('builds rows', () => {
    expect(toCsv([['a', 'b'], [1, '=x']])).toBe('"a","b"\n"1","\'=x"');
  });
});
