import { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Month + year selects over a date column whose filterFn is 'inMonthYear'. */
export function MonthYearFilter({ table, columnId }) {
  const column = table.getColumn(columnId);
  const value = column?.getFilterValue() ?? {};
  const rows = table.getCoreRowModel().rows;
  const years = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => new Date(row.getValue(columnId)).getFullYear()).filter(Boolean)),
      ).sort((a, b) => b - a),
    [rows, columnId],
  );
  const set = (patch) => {
    column?.setFilterValue({ ...value, ...patch });
    table.setPageIndex(0);
  };

  return (
    <>
      <Select
        value={value.month === undefined ? 'all' : String(value.month)}
        onValueChange={(next) => set({ month: next === 'all' ? undefined : Number(next) })}
      >
        <SelectTrigger size="sm" className="min-w-36">
          <SelectValue placeholder="All months" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All months</SelectItem>
          {MONTHS.map((month, index) => (
            <SelectItem key={month} value={String(index)}>
              {month}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.year === undefined ? 'all' : String(value.year)}
        onValueChange={(next) => set({ year: next === 'all' ? undefined : Number(next) })}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue placeholder="All years" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All years</SelectItem>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** Min / max inputs over a number column whose filterFn is 'inNumberRange'. */
export function RangeFilter({ table, columnId, label }) {
  const column = table.getColumn(columnId);
  const [min = '', max = ''] = column?.getFilterValue() ?? [];
  const set = (nextMin, nextMax) => {
    column?.setFilterValue(nextMin === '' && nextMax === '' ? undefined : [nextMin, nextMax]);
    table.setPageIndex(0);
  };

  return (
    <>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={min}
        onChange={(event) => set(event.target.value, max)}
        placeholder={`Min ${label.toLowerCase()}`}
        aria-label={`Minimum ${label.toLowerCase()}`}
        className="h-7 sm:w-36"
      />
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={max}
        onChange={(event) => set(min, event.target.value)}
        placeholder={`Max ${label.toLowerCase()}`}
        aria-label={`Maximum ${label.toLowerCase()}`}
        className="h-7 sm:w-36"
      />
    </>
  );
}

/**
 * One-of select over a column whose filterFn is 'equalsString', each option with its row count.
 * @param {{ value: string, label: string }[]} options
 */
export function SelectFilter({ table, columnId, options, allLabel }) {
  const column = table.getColumn(columnId);
  const rows = table.getCoreRowModel().rows;
  const counts = useMemo(() => {
    const found = {};
    for (const row of rows) {
      const value = row.getValue(columnId);
      found[value] = (found[value] || 0) + 1;
    }
    return found;
  }, [rows, columnId]);

  // A value no option has (e.g. a stale or mistyped link) would filter with a blank control: drop it.
  const value = column?.getFilterValue();
  const known = value === undefined || options.some((option) => option.value === value);
  useEffect(() => {
    if (!known) column?.setFilterValue(undefined);
  }, [known, column]);

  return (
    <Select
      value={known && value !== undefined ? value : 'all'}
      onValueChange={(value) => {
        column?.setFilterValue(value === 'all' ? undefined : value);
        table.setPageIndex(0);
      }}
    >
      <SelectTrigger size="sm" className="min-w-40">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {allLabel} ({rows.length})
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {`${option.label} (${counts[option.value] || 0})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
