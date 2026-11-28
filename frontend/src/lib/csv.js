/**
 * One CSV cell, quoted. Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the
 * start) gets a leading apostrophe so it opens as plain text.
 */
export function csvCell(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const toCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\n');

/** Saves text as a .csv download. */
export function downloadCsv(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
