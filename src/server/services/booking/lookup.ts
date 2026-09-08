import type { ReservationStatus } from "@prisma/client";

import { normalizePhone } from "@/lib/phone";
import type { TenantDb } from "@/server/tenant";
import { normalizeBookingReference } from "./reference";

/**
 * "My booking" (spec §15).
 *
 * No customer accounts in V1 (spec §97.18): a booking is found with its
 * reference plus the phone number it was made with. Both must match, so a
 * guessed reference alone reveals nothing.
 */

/** The simplified statuses customers see (spec §14, §97). */
export type CustomerStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

const CUSTOMER_STATUS: Record<ReservationStatus, CustomerStatus> = {
  AWAITING_CONFIRMATION: "PENDING",
  CONFIRMED: "CONFIRMED",
  READY_FOR_PICKUP: "CONFIRMED",
  ACTIVE: "ACTIVE",
  RETURN_DUE: "ACTIVE",
  OVERDUE: "ACTIVE",
  RETURN_INSPECTION: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "CANCELLED",
};

/**
 * Internal operational detail stays internal. A customer whose rental is
 * OVERDUE sees "in progress" — chasing a late return is a phone call from the
 * agency, not a status badge on a public page (spec §14).
 */
export function toCustomerStatus(status: ReservationStatus): CustomerStatus {
  return CUSTOMER_STATUS[status];
}

export async function findBookingForCustomer(
  db: TenantDb,
  rawReference: string,
  rawPhone: string,
) {
  const bookingReference = normalizeBookingReference(rawReference);
  const phone = normalizePhone(rawPhone);

  if (!bookingReference || !phone) return null;

  const reservation = await db.reservation.findFirst({
    where: {
      bookingReference,
      customer: { phone },
    },
    select: {
      id: true,
      bookingReference: true,
      status: true,
      pickupDatetime: true,
      returnDatetime: true,
      rentalDays: true,
      finalTotal: true,
      amountPaid: true,
      amountRemaining: true,
      securityDepositRequired: true,
      currency: true,
      pricingBreakdown: true,
      customer: { select: { fullName: true } },
      vehicle: {
        select: {
          brand: true,
          model: true,
          year: true,
          transmission: true,
          fuelType: true,
          seats: true,
          images: {
            where: { isCover: true },
            take: 1,
            select: { file: { select: { publicUrl: true } } },
          },
        },
      },
      pickupLocation: { select: { name: true } },
      returnLocation: { select: { name: true } },
    },
  });

  return reservation;
}
