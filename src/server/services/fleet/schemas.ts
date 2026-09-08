import { z } from "zod";

import {
  checkbox,
  commaSeparatedList,
  moneyString,
  optionalDate,
  optionalInt,
  optionalMoneyString,
  optionalText,
  requiredText,
} from "@/lib/validation";

/** Suggested categories. Free text, because fleets differ (spec §16). */
export const VEHICLE_CATEGORIES = [
  "Economy",
  "Compact",
  "Sedan",
  "SUV",
  "4x4",
  "Van",
  "Luxury",
  "Utility",
] as const;

export const TRANSMISSIONS = ["MANUAL", "AUTOMATIC"] as const;
export const FUEL_TYPES = [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "ELECTRIC",
  "LPG",
] as const;
export const VEHICLE_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "RENTED",
  "MAINTENANCE",
  "UNAVAILABLE",
] as const;

export const TRANSMISSION_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  AUTOMATIC: "Automatic",
};

export const FUEL_LABELS: Record<string, string> = {
  PETROL: "Petrol",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  ELECTRIC: "Electric",
  LPG: "LPG",
};

const currentYear = new Date().getUTCFullYear();

/**
 * The vehicle form (spec §16, §24, §28, §45).
 *
 * Prices stay strings the whole way through so they reach `numeric(12,2)`
 * without passing through a float.
 */
export const vehicleInputSchema = z
  .object({
    brand: requiredText("Brand is required", 60),
    model: requiredText("Model is required", 60),
    year: z.coerce
      .number()
      .int()
      .min(1980, "Year looks too old")
      .max(currentYear + 2, "Year is in the future"),
    category: requiredText("Category is required", 40),
    transmission: z.enum(TRANSMISSIONS),
    fuelType: z.enum(FUEL_TYPES),
    seats: z.coerce.number().int().min(1).max(9),
    doors: z.coerce.number().int().min(1).max(7),
    color: optionalText,
    features: commaSeparatedList,

    registrationNumber: requiredText("Registration number is required", 30),
    vin: optionalText,
    currentMileage: z.coerce
      .number()
      .int()
      .min(0, "Mileage cannot be negative")
      .max(2_000_000),

    dailyPrice: moneyString,
    weeklyPrice: optionalMoneyString,
    monthlyPrice: optionalMoneyString,
    securityDeposit: moneyString,

    // Per-vehicle override of the agency mileage policy (spec §45)
    mileagePolicy: z.enum(["", "UNLIMITED", "LIMITED"]),
    mileageKmPerDay: optionalInt,
    extraKmPrice: optionalMoneyString,

    currentStatus: z.enum(VEHICLE_STATUSES),
    isActive: checkbox,

    insuranceExpiryAt: optionalDate,
    technicalInspectionExpiryAt: optionalDate,
    nextServiceMileage: optionalInt,
  })
  .superRefine((value, ctx) => {
    // A limited-mileage vehicle without an allowance cannot be priced at return.
    if (value.mileagePolicy === "LIMITED") {
      if (value.mileageKmPerDay === null) {
        ctx.addIssue({
          code: "custom",
          path: ["mileageKmPerDay"],
          message: "Set a daily allowance for limited mileage",
        });
      }
      if (value.extraKmPrice === null) {
        ctx.addIssue({
          code: "custom",
          path: ["extraKmPrice"],
          message: "Set a price per extra km",
        });
      }
    }
  });

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

/** Filters for the fleet list. All optional, all from the query string. */
export const fleetFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["", ...VEHICLE_STATUSES]).optional(),
  category: z.string().trim().max(40).optional(),
  transmission: z.enum(["", ...TRANSMISSIONS]).optional(),
  fuelType: z.enum(["", ...FUEL_TYPES]).optional(),
  archived: z.enum(["", "1"]).optional(),
});

export type FleetFilters = z.infer<typeof fleetFilterSchema>;
