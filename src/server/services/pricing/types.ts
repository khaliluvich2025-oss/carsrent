import type { MoneyInput } from "@/lib/money";

/** How the rental duration was converted into billable units (spec §27). */
export type BillingRule = "DAY_ROUND_UP" | "GRACE_PERIOD" | "EXTRA_HOURLY";

export type BillingSettings = {
  rule: BillingRule;
  gracePeriodMinutes: number;
  extraHourPrice: MoneyInput;
};

export type Duration = {
  totalMinutes: number;
  /** Whole days the rental spans */
  fullDays: number;
  /** Minutes past the last full day */
  overrunMinutes: number;
  /** Days actually charged */
  billableDays: number;
  /** Hours charged on top of the billable days (EXTRA_HOURLY only) */
  extraHours: number;
  /** Overrun that was forgiven by the grace period */
  gracedMinutes: number;
};

export type SeasonalRate = {
  id?: string;
  name?: string;
  /** Date-only, stored at UTC midnight */
  startDate: Date;
  endDate: Date;
  dailyPrice: MoneyInput;
  priority: number;
};

export type VehicleRates = {
  dailyPrice: MoneyInput;
  weeklyPrice?: MoneyInput | null;
  monthlyPrice?: MoneyInput | null;
  securityDeposit: MoneyInput;
};

export type RateSource = "SEASONAL" | "MONTHLY" | "WEEKLY" | "DAILY";

export type SelectedRate = {
  source: RateSource;
  dailyRate: string;
  /** Set when the rate came from a season */
  seasonName?: string;
};

export type QuoteExtra = {
  name: string;
  priceType: "FLAT" | "PER_DAY";
  unitPrice: MoneyInput;
  quantity: number;
};

export type QuoteInput = {
  pickupAt: Date;
  returnAt: Date;
  vehicle: VehicleRates;
  billing: BillingSettings;
  seasonalRates?: SeasonalRate[];
  pickupFee?: MoneyInput;
  returnFee?: MoneyInput;
  extras?: QuoteExtra[];
  /** Absolute discount, not a percentage */
  discount?: MoneyInput;
  /** Agency IANA timezone, used only to decide which calendar day a season covers */
  timezone: string;
  currency?: string;
};

export type QuoteLineKind =
  | "BASE"
  | "EXTRA_HOURS"
  | "PICKUP_FEE"
  | "RETURN_FEE"
  | "EXTRA"
  | "DISCOUNT";

export type QuoteLine = {
  kind: QuoteLineKind;
  label: string;
  /** e.g. "5 days x 450.00 MAD" */
  detail?: string;
  amount: string;
};

export type Quote = {
  duration: Duration;
  rate: SelectedRate;

  baseAmount: string;
  extraHoursAmount: string;
  pickupFee: string;
  returnFee: string;
  extrasAmount: string;
  discountAmount: string;

  /** base + extra hours + fees + extras - discount. Never below zero. */
  total: string;

  /**
   * Held, never revenue (spec §10, §28, §97.8). Deliberately NOT part of
   * `total` — nothing in this module ever adds it in.
   */
  securityDeposit: string;

  currency: string;
  lines: QuoteLine[];
};
