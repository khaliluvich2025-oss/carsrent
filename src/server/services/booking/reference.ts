import { randomInt } from "node:crypto";

/**
 * Booking references are read aloud on the phone and typed back into "My
 * booking", so the alphabet excludes characters people confuse when speaking or
 * reading: I/1, O/0, and the letters that sound alike over a bad line.
 */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

export const BOOKING_REFERENCE_PREFIX = "RNT";

export function generateBookingReference(): string {
  let body = "";
  for (let index = 0; index < 6; index += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${BOOKING_REFERENCE_PREFIX}-${body}`;
}

/**
 * Accept what a customer actually types: lower case, a missing prefix, spaces
 * and stray punctuation.
 *
 * No confusable remapping is attempted. Because the alphabet already omits both
 * halves of every confusable pair (O and 0, I and 1), a reference containing one
 * is simply wrong, and guessing which character was meant would risk returning
 * somebody else's booking.
 */
export function normalizeBookingReference(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const body = cleaned.startsWith(BOOKING_REFERENCE_PREFIX)
    ? cleaned.slice(BOOKING_REFERENCE_PREFIX.length)
    : cleaned;

  return `${BOOKING_REFERENCE_PREFIX}-${body}`;
}
