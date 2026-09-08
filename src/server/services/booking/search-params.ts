import { z } from "zod";

import { wallClockToInstant } from "@/lib/dates";

/**
 * The search a customer is carrying through the booking flow (spec §8, §13).
 *
 * Dates travel in the URL as agency-local wall clock — that is what the customer
 * typed and what they expect to see echoed back — and are resolved to absolute
 * instants against the agency timezone at the point of use (spec §93).
 *
 * Pure and self-contained, because every page in the flow depends on parsing it
 * the same way.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const searchQuerySchema = z.object({
  pickupDate: z.string().regex(DATE),
  pickupTime: z.string().regex(TIME),
  returnDate: z.string().regex(DATE),
  returnTime: z.string().regex(TIME),
  pickupLocation: z.string().min(1),
  returnLocation: z.string().min(1),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchFilters = {
  category?: string;
  transmission?: "MANUAL" | "AUTOMATIC";
  fuelType?: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "LPG";
  minSeats?: number;
  maxDailyPrice?: string;
};

export type ParsedSearch = {
  query: SearchQuery;
  filters: SearchFilters;
  pickupAt: Date;
  returnAt: Date;
};

export type SearchParseError =
  | "INCOMPLETE"
  | "DATES_INVALID"
  | "DATES_PAST";

const FILTER_TRANSMISSIONS = ["MANUAL", "AUTOMATIC"] as const;
const FILTER_FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG"] as const;

function readFilters(params: Record<string, string | undefined>): SearchFilters {
  const filters: SearchFilters = {};

  if (params.category) filters.category = params.category;

  const transmission = params.transmission as (typeof FILTER_TRANSMISSIONS)[number];
  if (FILTER_TRANSMISSIONS.includes(transmission)) {
    filters.transmission = transmission;
  }

  const fuel = params.fuelType as (typeof FILTER_FUELS)[number];
  if (FILTER_FUELS.includes(fuel)) filters.fuelType = fuel;

  if (params.minSeats && /^\d+$/.test(params.minSeats)) {
    const seats = Number.parseInt(params.minSeats, 10);
    if (seats > 0 && seats <= 9) filters.minSeats = seats;
  }

  if (params.maxDailyPrice && /^\d+(\.\d{1,2})?$/.test(params.maxDailyPrice)) {
    filters.maxDailyPrice = params.maxDailyPrice;
  }

  return filters;
}

/**
 * Parse a search out of query parameters.
 *
 * `now` is injected rather than read from the clock so the past-date rule is
 * testable.
 */
export function parseSearch(
  params: Record<string, string | undefined>,
  timezone: string,
  now: Date = new Date(),
): { ok: true; value: ParsedSearch } | { ok: false; error: SearchParseError } {
  const parsed = searchQuerySchema.safeParse({
    pickupDate: params.pickupDate,
    pickupTime: params.pickupTime,
    returnDate: params.returnDate,
    returnTime: params.returnTime,
    pickupLocation: params.pickupLocation,
    returnLocation: params.returnLocation,
  });

  if (!parsed.success) return { ok: false, error: "INCOMPLETE" };

  const pickupAt = wallClockToInstant(
    parsed.data.pickupDate,
    parsed.data.pickupTime,
    timezone,
  );
  const returnAt = wallClockToInstant(
    parsed.data.returnDate,
    parsed.data.returnTime,
    timezone,
  );

  if (returnAt.getTime() <= pickupAt.getTime()) {
    return { ok: false, error: "DATES_INVALID" };
  }

  // A small tolerance, so a customer who lingers on the form for a minute is not
  // bounced for a pickup time that has just slipped into the past.
  if (pickupAt.getTime() < now.getTime() - 15 * 60_000) {
    return { ok: false, error: "DATES_PAST" };
  }

  return {
    ok: true,
    value: {
      query: parsed.data,
      filters: readFilters(params),
      pickupAt,
      returnAt,
    },
  };
}

/** Serialise a search back into a query string, preserving filters and language. */
export function buildSearchParams(
  query: SearchQuery,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams({
    pickupDate: query.pickupDate,
    pickupTime: query.pickupTime,
    returnDate: query.returnDate,
    returnTime: query.returnTime,
    pickupLocation: query.pickupLocation,
    returnLocation: query.returnLocation,
  });

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  return params.toString();
}

/** Flatten Next's `searchParams` into the shape the parsers expect. */
export function flattenParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  return flat;
}
