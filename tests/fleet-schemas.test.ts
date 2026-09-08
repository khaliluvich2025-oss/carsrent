import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/lib/validation";
import {
  fleetFilterSchema,
  vehicleInputSchema,
} from "@/server/services/fleet/schemas";

const VALID = {
  brand: "Dacia",
  model: "Duster",
  year: "2026",
  category: "SUV",
  transmission: "AUTOMATIC",
  fuelType: "DIESEL",
  seats: "5",
  doors: "5",
  color: " Gris ",
  features: "Air conditioning, GPS ,, Bluetooth",
  registrationNumber: " 12345-a-6 ",
  vin: "",
  currentMileage: "18400",
  dailyPrice: "450",
  weeklyPrice: "",
  monthlyPrice: "",
  securityDeposit: "3000",
  mileagePolicy: "",
  mileageKmPerDay: "",
  extraKmPrice: "",
  currentStatus: "AVAILABLE",
  isActive: "on",
  insuranceExpiryAt: "",
  technicalInspectionExpiryAt: "",
  nextServiceMileage: "",
};

const parse = (overrides: Partial<typeof VALID> = {}) =>
  vehicleInputSchema.safeParse({ ...VALID, ...overrides });

describe("vehicle input", () => {
  it("accepts a well-formed vehicle", () => {
    const result = parse();
    expect(result.success).toBe(true);
  });

  it("normalises money to two decimal places as a string", () => {
    const result = parse({ dailyPrice: "450", securityDeposit: "3000.5" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Strings, not numbers — they must reach numeric(12,2) without a float.
    expect(result.data.dailyPrice).toBe("450.00");
    expect(result.data.securityDeposit).toBe("3000.50");
    expect(typeof result.data.dailyPrice).toBe("string");
  });

  it("accepts a comma as the decimal separator", () => {
    const result = parse({ dailyPrice: "450,50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPrice).toBe("450.50");
  });

  it("turns blank optional prices into null rather than zero", () => {
    const result = parse({ weeklyPrice: "", monthlyPrice: "  " });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.weeklyPrice).toBeNull();
    expect(result.data.monthlyPrice).toBeNull();
  });

  it("rejects a negative price", () => {
    const result = parse({ dailyPrice: "-10" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toHaveProperty("dailyPrice");
    }
  });

  it("rejects a price with too many decimals", () => {
    expect(parse({ dailyPrice: "450.123" }).success).toBe(false);
  });

  it("trims text and splits features into a clean list", () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.color).toBe("Gris");
    expect(result.data.features).toEqual([
      "Air conditioning",
      "GPS",
      "Bluetooth",
    ]);
  });

  it("keeps registration as entered here and uppercases it on write", () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.registrationNumber).toBe("12345-a-6");
  });

  it("requires an allowance and a per-km price for limited mileage", () => {
    const result = parse({ mileagePolicy: "LIMITED" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors).toHaveProperty("mileageKmPerDay");
      expect(errors).toHaveProperty("extraKmPrice");
    }
  });

  it("accepts limited mileage when both values are given", () => {
    const result = parse({
      mileagePolicy: "LIMITED",
      mileageKmPerDay: "250",
      extraKmPrice: "3.5",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mileageKmPerDay).toBe(250);
    expect(result.data.extraKmPrice).toBe("3.50");
  });

  it("does not demand mileage details when the policy is unlimited", () => {
    expect(parse({ mileagePolicy: "UNLIMITED" }).success).toBe(true);
  });

  it("rejects an implausible year", () => {
    expect(parse({ year: "1920" }).success).toBe(false);
    expect(parse({ year: "2400" }).success).toBe(false);
  });

  it("rejects a negative odometer reading", () => {
    expect(parse({ currentMileage: "-5" }).success).toBe(false);
  });

  it("requires brand, model and registration", () => {
    const result = parse({ brand: "  ", model: "", registrationNumber: " " });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors).toHaveProperty("brand");
      expect(errors).toHaveProperty("model");
      expect(errors).toHaveProperty("registrationNumber");
    }
  });

  it("reads the active checkbox", () => {
    expect(parse({ isActive: "on" }).success).toBe(true);
    const off = vehicleInputSchema.safeParse({ ...VALID, isActive: undefined });
    expect(off.success).toBe(true);
    if (off.success) expect(off.data.isActive).toBe(false);
  });

  it("parses date fields as UTC midnight, not local", () => {
    const result = parse({ insuranceExpiryAt: "2026-12-31" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.insuranceExpiryAt?.toISOString()).toBe(
        "2026-12-31T00:00:00.000Z",
      );
    }
  });
});

describe("fleet filters", () => {
  it("accepts an empty filter set", () => {
    expect(fleetFilterSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid enum filters", () => {
    const result = fleetFilterSchema.safeParse({
      status: "AVAILABLE",
      transmission: "MANUAL",
      fuelType: "DIESEL",
      q: "duster",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty string as no filter", () => {
    const result = fleetFilterSchema.safeParse({ status: "", fuelType: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a status that is not a real vehicle status", () => {
    expect(fleetFilterSchema.safeParse({ status: "SOLD" }).success).toBe(false);
  });
});
