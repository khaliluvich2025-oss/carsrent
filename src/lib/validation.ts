import { z } from "zod";

import { money, toDecimal } from "./money";

/**
 * Shared Zod building blocks for form input.
 *
 * Money arrives from a form as a string and must stay a string all the way into
 * Prisma's `Decimal` column — parsing it through `Number` on the way would
 * reintroduce exactly the floating-point error spec §94 forbids.
 */

const MONEY_PATTERN = /^-?\d{1,10}([.,]\d{1,2})?$/;

/** A required monetary amount, normalised to a 2-decimal string. */
export const moneyString = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => MONEY_PATTERN.test(v), "Enter an amount like 450 or 450.50")
  .transform((v) => money(v.replace(",", ".")).toFixed(2))
  .refine((v) => !toDecimal(v).isNegative(), "Cannot be negative");

/** An optional monetary amount. Blank becomes null, not zero. */
export const optionalMoneyString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => v === null || MONEY_PATTERN.test(v),
    "Enter an amount like 450 or 450.50",
  )
  .transform((v) => (v === null ? null : money(v.replace(",", ".")).toFixed(2)))
  .refine((v) => v === null || !toDecimal(v).isNegative(), "Cannot be negative");

/** Trimmed text that becomes null when blank. */
export const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/** A required non-empty trimmed string. */
export const requiredText = (message = "Required", max = 200) =>
  z.string().trim().min(1, message).max(max);

/** An integer from a form field, blank tolerated as null. */
export const optionalInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d+$/.test(v), "Enter a whole number")
  .transform((v) => (v === null ? null : Number.parseInt(v, 10)));

/** A date-only form field (`<input type="date">`), blank tolerated as null. */
export const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Enter a valid date",
  )
  .transform((v) => (v === null ? null : new Date(`${v}T00:00:00.000Z`)));

/** Comma-separated free text into a clean list, e.g. vehicle features. */
export const commaSeparatedList = z
  .string()
  .trim()
  .transform((v) =>
    v
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

/** A checkbox: present in FormData means checked. */
export const checkbox = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true");

/** Collapse a Zod error into the flat `{ field: message }` shape forms want. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
