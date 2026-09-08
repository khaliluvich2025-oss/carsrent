/**
 * Contract numbering (spec §50).
 *
 * The format is `PREFIX-YEAR-SEQUENCE`, e.g. `CTR-2026-00128`. The sequence is
 * an agency-wide counter incremented atomically at generation time; the year is
 * taken from the moment of generation and is decorative, so a counter that runs
 * across a new year still produces unique, ordered numbers.
 *
 * Pure formatting is kept separate from the counter so the format can be tested
 * without a database.
 */

export const SEQUENCE_PAD = 5;

export function formatContractNumber(
  prefix: string,
  year: number,
  sequence: number,
): string {
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "CTR";
  return `${cleanPrefix}-${year}-${String(sequence).padStart(SEQUENCE_PAD, "0")}`;
}

export function parseContractNumber(value: string): {
  prefix: string;
  year: number;
  sequence: number;
} | null {
  const match = /^([A-Z0-9]+)-(\d{4})-(\d+)$/.exec(value.trim().toUpperCase());
  if (!match) return null;

  return {
    prefix: match[1],
    year: Number.parseInt(match[2], 10),
    sequence: Number.parseInt(match[3], 10),
  };
}
