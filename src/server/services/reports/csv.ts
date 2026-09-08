/**
 * CSV export (spec §73).
 *
 * Hand-rolled because the requirements are small and the failure modes are
 * specific: a customer called O'Brien, an address containing a comma, and a note
 * containing a newline all have to survive the round trip into Excel.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

/**
 * Escape one field.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote: spreadsheets treat
 * those as formulas, and a customer note starting with `=` should be text, not
 * something Excel evaluates.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvField(column.value(row))).join(","),
  );

  // CRLF: what Excel expects, and harmless everywhere else.
  return [header, ...body].join("\r\n");
}

/**
 * A BOM so Excel on Windows reads the file as UTF-8 rather than the system
 * codepage — without it, French and Arabic customer names arrive mangled.
 */
export function csvWithBom(csv: string): string {
  return `﻿${csv}`;
}

export function csvFilename(prefix: string, period: string): string {
  const safe = period.replace(/[^A-Za-z0-9-]/g, "-").replace(/-+/g, "-");
  return `${prefix}-${safe}.csv`;
}
