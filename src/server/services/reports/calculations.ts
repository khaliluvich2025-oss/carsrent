import { money, subtract, toDecimal, type MoneyInput } from "@/lib/money";

/**
 * Report arithmetic (spec §62, §69, §70, §71).
 *
 * Pure, because these are the numbers an owner uses to decide whether to buy
 * another car. They have to be reproducible and explainable, and a figure that
 * quietly divides by zero is worse than no figure at all.
 */

/**
 * Fleet utilisation: rented days over available days (spec §69).
 *
 * Returned as a fraction 0..1, with the inputs alongside — a bare "72%" that
 * nobody can reconstruct is not much use in a review.
 */
export function computeUtilization(input: {
  rentedDays: number;
  vehicleCount: number;
  periodDays: number;
}): { rate: number; rentedDays: number; availableDays: number } {
  const availableDays = Math.max(0, input.vehicleCount * input.periodDays);

  return {
    // No vehicles means no utilisation, not a division by zero.
    rate: availableDays === 0 ? 0 : input.rentedDays / availableDays,
    rentedDays: input.rentedDays,
    availableDays,
  };
}

/**
 * Net contribution, deliberately not called profit (spec §62).
 *
 * Revenue attributable to a vehicle minus the expenses booked directly against
 * it. Agency-wide costs — rent, salaries, marketing — are not included, so
 * calling this profit would overstate it, and the spec is explicit about the
 * wording for exactly that reason.
 */
export function computeNetContribution(input: {
  revenue: MoneyInput;
  directExpenses: MoneyInput;
}): string {
  return subtract(input.revenue, input.directExpenses).toFixed(2);
}

/** Average booking value over completed bookings (spec §69). */
export function computeAverageBookingValue(
  totalRevenue: MoneyInput,
  bookingCount: number,
): string {
  if (bookingCount <= 0) return "0.00";
  return money(
    toDecimal(totalRevenue).dividedBy(bookingCount),
  ).toFixed(2);
}

/** A rate as a fraction 0..1, safe when the denominator is zero. */
export function safeRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function formatPercent(rate: number, decimals = 0): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

/**
 * Repeat-customer rate (spec §71): customers with more than one booking, over
 * customers with any booking.
 */
export function computeRepeatRate(
  bookingsPerCustomer: number[],
): { repeat: number; total: number; rate: number } {
  const total = bookingsPerCustomer.length;
  const repeat = bookingsPerCustomer.filter((count) => count > 1).length;
  return { repeat, total, rate: safeRate(repeat, total) };
}

/** Average rental duration in days (spec §71). */
export function computeAverageDuration(durations: number[]): number {
  if (durations.length === 0) return 0;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round((total / durations.length) * 10) / 10;
}

/**
 * Rank a set of counts, highest first, keeping ties in a stable order.
 * Used for the "most active" and "most popular" tables in spec §71.
 */
export function rankCounts<T extends { count: number }>(
  rows: T[],
  limit = 10,
): T[] {
  return [...rows].sort((a, b) => b.count - a.count).slice(0, limit);
}
