/**
 * Phone numbers are the customer identity key (spec §34), so two people typing
 * the same number in different styles must land on the same customer record.
 *
 * Normalisation is deliberately conservative: strip formatting, keep a leading
 * `+`, and leave the digits alone. No country inference — guessing that a
 * 9-digit number is Moroccan would silently merge a French customer into a
 * Moroccan one, and a wrong merge is far worse than a duplicate.
 */

export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 0) return "";

  // 00 is the international prefix written out; normalise it to +.
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  return hasPlus ? `+${digits}` : digits;
}

/** Loose validity check — enough to catch typos without rejecting real numbers. */
export function isPlausiblePhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/** Digits only, for a wa.me deep link (spec §68). */
export function toWhatsAppNumber(input: string): string {
  return input.replace(/\D/g, "");
}
