import { withBuffer } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { multiply } from "@/lib/money";
import type { TenantDb } from "@/server/tenant";
import { rethrowAsAvailabilityError } from "@/server/services/availability/errors";
import { computeQuote } from "@/server/services/pricing";
import type { Quote } from "@/server/services/pricing";
import { generateBookingReference } from "./reference";

/**
 * Reservation creation (spec §12, §13, §20, §84).
 *
 * The whole thing is one transaction: customer, reservation, occupancy block and
 * status history commit together or not at all. If the block cannot be inserted
 * because somebody else took the car in the meantime, the exclusion constraint
 * rejects it and the reservation is rolled back with it — there is no window in
 * which a reservation exists without the dates being held (spec §12).
 */

export type BookingCustomer = {
  fullName: string;
  phone: string;
  email?: string | null;
  nationality?: string | null;
};

export type CreateReservationInput = {
  vehicleId: string;
  pickupLocationId: string;
  returnLocationId: string;
  pickupAt: Date;
  returnAt: Date;
  customer: BookingCustomer;
  customerNote?: string | null;
  extras?: { extraId: string; quantity: number }[];
  /** Set when an employee books on the phone; null for a website booking. */
  createdById?: string | null;
};

export type CreateReservationResult = {
  reservationId: string;
  bookingReference: string;
  quote: Quote;
};

export class BookingValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "BookingValidationError";
  }
}

/**
 * Everything the quote needs, loaded and checked against this agency.
 *
 * Exported because the details and booking pages price the same rental before
 * anything is written, and they must use identical inputs — a quote the customer
 * saw and a quote we store that disagree is a dispute waiting to happen.
 */
export async function loadQuoteContext(
  db: TenantDb,
  input: {
    vehicleId: string;
    pickupLocationId: string;
    returnLocationId: string;
    pickupAt: Date;
  },
) {
  const [vehicle, pickupLocation, returnLocation, settings, agency] =
    await Promise.all([
      db.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          isActive: true,
          dailyPrice: true,
          weeklyPrice: true,
          monthlyPrice: true,
          securityDeposit: true,
        },
      }),
      db.location.findUnique({
        where: { id: input.pickupLocationId },
        select: { id: true, name: true, pickupFee: true, isActive: true },
      }),
      db.location.findUnique({
        where: { id: input.returnLocationId },
        select: { id: true, name: true, returnFee: true, isActive: true },
      }),
      db.agencySettings.findFirst({
        select: {
          billingRule: true,
          gracePeriodMinutes: true,
          extraHourPrice: true,
          bufferMinutes: true,
          securityDepositEnabled: true,
          allowDifferentReturnSite: true,
        },
      }),
      db.agency.findFirst({ select: { timezone: true, currency: true } }),
    ]);

  if (!vehicle?.isActive) {
    throw new BookingValidationError("vehicleId", "This car is not available.");
  }
  if (!pickupLocation?.isActive) {
    throw new BookingValidationError(
      "pickupLocation",
      "That pickup location is not available.",
    );
  }
  if (!returnLocation?.isActive) {
    throw new BookingValidationError(
      "returnLocation",
      "That return location is not available.",
    );
  }
  if (
    settings?.allowDifferentReturnSite === false &&
    pickupLocation.id !== returnLocation.id
  ) {
    throw new BookingValidationError(
      "returnLocation",
      "This agency requires the car to be returned where it was collected.",
    );
  }

  const seasonalRates = await db.seasonalRate.findMany({
    where: {
      isActive: true,
      OR: [{ vehicleId: null }, { vehicleId: vehicle.id }],
    },
    select: {
      name: true,
      startDate: true,
      endDate: true,
      dailyPrice: true,
      priority: true,
    },
  });

  return {
    vehicle,
    pickupLocation,
    returnLocation,
    settings,
    seasonalRates,
    timezone: agency?.timezone ?? "Africa/Casablanca",
    currency: agency?.currency ?? "MAD",
  };
}

type QuoteContext = Awaited<ReturnType<typeof loadQuoteContext>>;

export function quoteFromContext(
  context: QuoteContext,
  window: { pickupAt: Date; returnAt: Date },
  extras: {
    name: string;
    priceType: "FLAT" | "PER_DAY";
    unitPrice: string;
    quantity: number;
  }[] = [],
): Quote {
  return computeQuote({
    pickupAt: window.pickupAt,
    returnAt: window.returnAt,
    vehicle: {
      dailyPrice: context.vehicle.dailyPrice,
      weeklyPrice: context.vehicle.weeklyPrice,
      monthlyPrice: context.vehicle.monthlyPrice,
      // §28: the deposit is per vehicle, and switched off entirely at agency level.
      securityDeposit: context.settings?.securityDepositEnabled
        ? context.vehicle.securityDeposit
        : "0",
    },
    billing: {
      rule: context.settings?.billingRule ?? "GRACE_PERIOD",
      gracePeriodMinutes: context.settings?.gracePeriodMinutes ?? 60,
      extraHourPrice: context.settings?.extraHourPrice ?? "0",
    },
    seasonalRates: context.seasonalRates,
    pickupFee: context.pickupLocation.pickupFee,
    returnFee: context.returnLocation.returnFee,
    extras,
    timezone: context.timezone,
    currency: context.currency,
  });
}

export async function createReservation(
  db: TenantDb,
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const agencyId = db.$agencyId;

  const context = await loadQuoteContext(db, {
    vehicleId: input.vehicleId,
    pickupLocationId: input.pickupLocationId,
    returnLocationId: input.returnLocationId,
    pickupAt: input.pickupAt,
  });

  // Snapshot the extras' prices now, so a later catalogue edit never rewrites
  // this booking's total (spec §25).
  const selectedExtras =
    input.extras && input.extras.length > 0
      ? await db.extra.findMany({
          where: {
            id: { in: input.extras.map((e) => e.extraId) },
            isActive: true,
          },
          select: { id: true, name: true, priceType: true, price: true },
        })
      : [];

  const extraLines = selectedExtras.map((extra) => ({
    extraId: extra.id,
    name: extra.name,
    priceType: extra.priceType,
    unitPrice: extra.price.toString(),
    quantity:
      input.extras?.find((e) => e.extraId === extra.id)?.quantity ?? 1,
  }));

  const quote = quoteFromContext(
    context,
    { pickupAt: input.pickupAt, returnAt: input.returnAt },
    extraLines,
  );

  const bufferMinutes = context.settings?.bufferMinutes ?? 0;
  const blockedUntil = withBuffer(input.returnAt, bufferMinutes);
  const phone = normalizePhone(input.customer.phone);

  try {
    return await db.$transaction(async (tx) => {
      // Expired checkout holds must not keep a car blocked (spec §30). Swept in
      // the same transaction as the insert, so the exclusion constraint never
      // sees a stale row.
      await tx.vehicleBlock.deleteMany({
        where: {
          vehicleId: input.vehicleId,
          kind: "PAYMENT_HOLD",
          expiresAt: { lte: new Date() },
        },
      });

      // Phone is the dedupe key (spec §34) — a returning customer reuses their
      // record rather than accumulating duplicates.
      const customer = await tx.customer.upsert({
        where: { agencyId_phone: { agencyId, phone } },
        create: {
          agencyId,
          fullName: input.customer.fullName,
          phone,
          email: input.customer.email || null,
          nationality: input.customer.nationality || null,
        },
        update: {
          // Only fill gaps; never overwrite what the agency already knows.
          email: input.customer.email || undefined,
          nationality: input.customer.nationality || undefined,
        },
        select: { id: true },
      });

      let bookingReference = generateBookingReference();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await tx.reservation.findFirst({
          where: { bookingReference },
          select: { id: true },
        });
        if (!clash) break;
        bookingReference = generateBookingReference();
      }

      const reservation = await tx.reservation.create({
        data: {
          agencyId,
          bookingReference,
          customerId: customer.id,
          vehicleId: input.vehicleId,
          pickupLocationId: input.pickupLocationId,
          returnLocationId: input.returnLocationId,
          pickupDatetime: input.pickupAt,
          returnDatetime: input.returnAt,
          rentalDays: quote.duration.billableDays,
          baseAmount: quote.baseAmount,
          pickupFee: quote.pickupFee,
          returnFee: quote.returnFee,
          extrasAmount: quote.extrasAmount,
          discountAmount: quote.discountAmount,
          calculatedTotal: quote.total,
          finalTotal: quote.total,
          amountPaid: "0",
          amountRemaining: quote.total,
          securityDepositRequired: quote.securityDeposit,
          currency: quote.currency,
          // spec §12, §97.3 — always starts here, never auto-confirmed
          status: "AWAITING_CONFIRMATION",
          paymentStatus: "UNPAID",
          pricingBreakdown: JSON.parse(JSON.stringify(quote.lines)),
          customerNote: input.customerNote || null,
          createdById: input.createdById ?? null,
        },
        select: { id: true, bookingReference: true },
      });

      if (extraLines.length > 0) {
        await tx.reservationExtra.createMany({
          data: extraLines.map((line) => ({
            agencyId,
            reservationId: reservation.id,
            extraId: line.extraId,
            name: line.name,
            priceType: line.priceType,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            amount: multiply(
              line.unitPrice,
              line.priceType === "PER_DAY"
                ? line.quantity * quote.duration.billableDays
                : line.quantity,
            ).toFixed(2),
          })),
        });
      }

      // The dates are held the moment the reservation exists (spec §12, §97.2).
      await tx.vehicleBlock.create({
        data: {
          agencyId,
          vehicleId: input.vehicleId,
          kind: "RESERVATION",
          startsAt: input.pickupAt,
          endsAt: blockedUntil,
          bufferMinutes,
          reservationId: reservation.id,
          createdById: input.createdById ?? null,
        },
      });

      await tx.reservationStatusHistory.create({
        data: {
          agencyId,
          reservationId: reservation.id,
          toStatus: "AWAITING_CONFIRMATION",
          changedById: input.createdById ?? null,
        },
      });

      return {
        reservationId: reservation.id,
        bookingReference: reservation.bookingReference,
        quote,
      };
    });
  } catch (error) {
    // A lost race becomes "no longer available", not a 500 (spec §92).
    rethrowAsAvailabilityError(error);
  }
}
