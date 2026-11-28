/**
 * Whether a date falls in the chosen month and/or year (local time).
 * @param {string | Date | null} dataValue
 * @param {{ month?: number, year?: number }} filterValue  month is 0–11
 */
export function matchesMonthYear(dataValue, filterValue) {
  if (!dataValue) return false;
  const date = new Date(dataValue);
  if (Number.isNaN(date.getTime())) return false;
  if (filterValue.year !== undefined && date.getFullYear() !== filterValue.year) return false;
  if (filterValue.month !== undefined && date.getMonth() !== filterValue.month) return false;
  return true;
}
