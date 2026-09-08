import Decimal from "decimal.js";

/**
 * Money handling (spec §94).
 *
 * Rule: a monetary value is a `Decimal` from the moment it leaves the database
 * or a form until the moment it is formatted for display. It never becomes a JS
 * `number` in between, because `0.1 + 0.2` is not `0.3` and a rental total that
 * is off by a centime is a real dispute with a real customer.
 *
 * Storage is `numeric(12,2)`, so every value that lands in a column is rounded
 * to 2 decimal places here first, using half-up (the rounding people expect on
 * an invoice).
 */

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Anything that can stand in for a monetary amount. */
export type MoneyInput = Decimal | string | number | { toString(): string };

export function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid monetary number: ${value}`);
    }
    // Via string, so a float that arrived from a form does not smuggle in
    // binary rounding error.
    return new Decimal(value.toString());
  }
  return new Decimal(typeof value === "string" ? value : value.toString());
}

export const ZERO = new Decimal(0);

/** Round to the 2 decimal places the database column stores. */
export function money(value: MoneyInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(...values: MoneyInput[]): Decimal {
  return money(values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), ZERO));
}

export function subtract(a: MoneyInput, b: MoneyInput): Decimal {
  return money(toDecimal(a).minus(toDecimal(b)));
}

export function multiply(a: MoneyInput, factor: MoneyInput): Decimal {
  return money(toDecimal(a).times(toDecimal(factor)));
}

/** Percentage of an amount, e.g. a 30% online deposit (spec §29). */
export function percentOf(amount: MoneyInput, percent: number): Decimal {
  return money(toDecimal(amount).times(percent).dividedBy(100));
}

export function isZero(value: MoneyInput): boolean {
  return toDecimal(value).isZero();
}

export function isNegative(value: MoneyInput): boolean {
  return toDecimal(value).isNegative();
}

/** Never let a derived balance go below zero (e.g. overpaid remainder). */
export function clampAtZero(value: MoneyInput): Decimal {
  const d = toDecimal(value);
  return d.isNegative() ? ZERO : money(d);
}

export function maxOf(a: MoneyInput, b: MoneyInput): Decimal {
  const da = toDecimal(a);
  const db = toDecimal(b);
  return money(da.greaterThan(db) ? da : db);
}

/**
 * Display formatting. Default `MAD` per spec §94; the currency argument exists
 * so a second currency is additive rather than a rewrite.
 */
export function formatMoney(
  value: MoneyInput,
  currency = "MAD",
  locale = "fr-MA",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money(value).toNumber());
}

export { Decimal };
