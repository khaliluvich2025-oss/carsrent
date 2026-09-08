"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isPlausiblePhone } from "@/lib/phone";
import { fieldErrors } from "@/lib/validation";
import { VehicleUnavailableError } from "@/server/services/availability/errors";
import {
  BookingValidationError,
  createReservation,
} from "@/server/services/booking/create";
import { parseSearch } from "@/server/services/booking/search-params";
import { getPublicAgency } from "@/server/services/public/agency";

export type BookingState = {
  errors?: Record<string, string>;
  /** The car was taken while the customer was filling in the form (spec §92) */
  unavailable?: boolean;
};

/**
 * Customer details (spec §11).
 *
 * Name and phone only. No licence, CIN or passport upload — those are collected
 * and verified at pickup (spec §11, §97.1), and asking for them here would cost
 * bookings for no operational gain.
 */
const bookingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z
    .string()
    .trim()
    .min(1, "Enter a phone number")
    .refine(isPlausiblePhone, "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || z.string().email().safeParse(value).success,
      "Enter a valid email address",
    ),
  nationality: z
    .string()
    .trim()
    .max(60)
    .transform((value) => (value === "" ? null : value)),
  customerNote: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === "" ? null : value)),
});

export async function createBookingAction(
  slug: string,
  vehicleId: string,
  search: Record<string, string>,
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const agency = await getPublicAgency(slug);
  if (!agency) return { errors: { _form: "This agency is not available." } };

  const parsedSearch = parseSearch(search, agency.timezone);
  if (!parsedSearch.ok) {
    redirect(`/${slug}`);
  }

  const value = (name: string) => (formData.get(name) ?? "").toString();
  const parsed = bookingSchema.safeParse({
    fullName: value("fullName"),
    phone: value("phone"),
    email: value("email"),
    nationality: value("nationality"),
    customerNote: value("customerNote"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { query, pickupAt, returnAt } = parsedSearch.value;

  const extraIds = formData
    .getAll("extras")
    .map((entry) => entry.toString())
    .filter(Boolean);

  let reference: string;
  try {
    // Availability check #2 and the reservation itself happen inside one
    // transaction, guarded by the exclusion constraint (spec §20, §92).
    const result = await createReservation(agency.db, {
      vehicleId,
      pickupLocationId: query.pickupLocation,
      returnLocationId: query.returnLocation,
      pickupAt,
      returnAt,
      customer: {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        email: parsed.data.email,
        nationality: parsed.data.nationality,
      },
      customerNote: parsed.data.customerNote,
      extras: extraIds.map((extraId) => ({ extraId, quantity: 1 })),
      createdById: null,
    });
    reference = result.bookingReference;
  } catch (error) {
    if (error instanceof VehicleUnavailableError) {
      return { unavailable: true };
    }
    if (error instanceof BookingValidationError) {
      return { errors: { [error.field]: error.message } };
    }
    throw error;
  }

  const lang = search.lang ?? agency.defaultLocale;
  redirect(`/${slug}/booking/${reference}?lang=${lang}`);
}
