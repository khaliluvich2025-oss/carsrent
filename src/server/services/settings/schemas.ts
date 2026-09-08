import { z } from "zod";

import {
  checkbox,
  moneyString,
  optionalText,
  requiredText,
} from "@/lib/validation";

/** Locations and delivery points (spec §22). */
export const locationSchema = z.object({
  name: requiredText("Location name is required", 80),
  address: optionalText,
  pickupFee: moneyString,
  returnFee: moneyString,
  isActive: checkbox,
});

export type LocationInput = z.infer<typeof locationSchema>;

/** Whether pickup and return may differ (spec §22). */
export const deliverySettingsSchema = z.object({
  allowDifferentReturnSite: checkbox,
});

/** Billing, buffer and deposit rules (spec §21, §27, §28, §54). */
export const billingSettingsSchema = z
  .object({
    billingRule: z.enum(["DAY_ROUND_UP", "GRACE_PERIOD", "EXTRA_HOURLY"]),
    gracePeriodMinutes: z.coerce
      .number()
      .int()
      .min(0, "Cannot be negative")
      .max(24 * 60, "Grace cannot exceed a day"),
    extraHourPrice: moneyString,
    bufferMinutes: z.coerce
      .number()
      .int()
      .min(0, "Cannot be negative")
      .max(72 * 60, "Buffer cannot exceed three days"),
    noShowWaitingMinutes: z.coerce
      .number()
      .int()
      .min(0, "Cannot be negative")
      .max(72 * 60),
    securityDepositEnabled: checkbox,
  })
  .superRefine((value, ctx) => {
    // An hourly overrun charge of zero silently makes late returns free.
    if (value.billingRule === "EXTRA_HOURLY" && value.extraHourPrice === "0.00") {
      ctx.addIssue({
        code: "custom",
        path: ["extraHourPrice"],
        message: "Set a price per extra hour, or choose a different billing rule",
      });
    }
  });

export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

/** Seasonal pricing (spec §24). */
export const seasonalRateSchema = z
  .object({
    name: requiredText("Season name is required", 60),
    startDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a start date"),
    endDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an end date"),
    dailyPrice: moneyString,
    priority: z.coerce.number().int().min(0).max(100),
    vehicleId: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The season must end on or after it starts",
      });
    }
  })
  .transform((value) => ({
    ...value,
    startDate: new Date(`${value.startDate}T00:00:00.000Z`),
    endDate: new Date(`${value.endDate}T00:00:00.000Z`),
    vehicleId: value.vehicleId === "" ? null : value.vehicleId,
  }));

export type SeasonalRateInput = z.infer<typeof seasonalRateSchema>;

/** Optional add-ons priced by the engine (spec §25). */
export const extraSchema = z.object({
  name: requiredText("Name is required", 60),
  description: optionalText,
  priceType: z.enum(["FLAT", "PER_DAY"]),
  price: moneyString,
  isActive: checkbox,
});

export type ExtraInput = z.infer<typeof extraSchema>;

export const BILLING_RULE_LABELS = {
  DAY_ROUND_UP: {
    label: "Round up to a full day",
    hint: "Any part of a day counts as a whole day.",
  },
  GRACE_PERIOD: {
    label: "24 hours + grace period",
    hint: "A short overrun is free. Beyond it, a whole extra day is charged.",
  },
  EXTRA_HOURLY: {
    label: "24 hours + hourly charge",
    hint: "A short overrun is free. Beyond it, each started hour is charged.",
  },
} as const;
