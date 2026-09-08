import type { AdditionalChargeType } from "@prisma/client";

import { withBuffer } from "@/lib/dates";
import { money, sum, toDecimal } from "@/lib/money";
import { isVehicleOverlapViolation } from "@/server/services/availability/errors";
import { refreshReservationPayment } from "@/server/services/payments/record";
import { computeDepositBalance } from "@/server/services/payments/rollup";
import type { TenantDb } from "@/server/tenant";
import {
  computeFuelCharge,
  computeLateReturn,
  computeMileageCharge,
  settleDeposit,
} from "./charges";

/**
 * The return flow (spec §42–§49).
 *
 * Charges are *proposed* by the calculators and only ever applied when an
 * employee confirms them (spec §44's "allow authorized manual adjustment",
 * §47's "employee confirms damage manually"). Nothing here writes money on its
 * own.
 */

export async function getReturnContext(db: TenantDb, reservationId: string) {
  return db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      bookingReference: true,
      status: true,
      pickupDatetime: true,
      returnDatetime: true,
      actualPickupDatetime: true,
      actualReturnDatetime: true,
      rentalDays: true,
      baseAmount: true,
      finalTotal: true,
      amountPaid: true,
      amountRemaining: true,
      securityDepositRequired: true,
      currency: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          registrationNumber: true,
          currentMileage: true,
          mileagePolicy: true,
          mileageKmPerDay: true,
          extraKmPrice: true,
        },
      },
      returnLocation: { select: { name: true } },
      securityDeposit: true,
      additionalCharges: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          settleFromDeposit: true,
          createdAt: true,
        },
      },
      inspections: {
        orderBy: { type: "asc" },
        select: {
          id: true,
          type: true,
          performedAt: true,
          mileage: true,
          fuelLevel: true,
          condition: true,
          notes: true,
          damageCheckedAt: true,
          photos: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              position: true,
              file: { select: { publicUrl: true } },
            },
          },
        },
      },
      damageRecords: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          location: true,
          damageType: true,
          description: true,
          isPreExisting: true,
          estimatedCharge: true,
          confirmedCharge: true,
          createdAt: true,
        },
      },
    },
  });
}

export type ReturnContext = NonNullable<
  Awaited<ReturnType<typeof getReturnContext>>
>;

export type ProposedCharges = {
  late: ReturnType<typeof computeLateReturn>;
  mileage: ReturnType<typeof computeMileageCharge> | null;
  fuel: ReturnType<typeof computeFuelCharge> | null;
};

/**
 * What the return *would* cost, given the readings taken.
 *
 * Returns the workings alongside each figure so the screen can explain the
 * number rather than just asserting it — an employee has to defend these at the
 * counter.
 */
export async function proposeCharges(
  db: TenantDb,
  reservation: ReturnContext,
): Promise<ProposedCharges | null> {
  const pickup = reservation.inspections.find((i) => i.type === "PICKUP");
  const ret = reservation.inspections.find((i) => i.type === "RETURN");
  if (!ret || ret.mileage == null || ret.fuelLevel == null) return null;

  const settings = await db.agencySettings.findFirst({
    select: {
      billingRule: true,
      gracePeriodMinutes: true,
      extraHourPrice: true,
      mileagePolicy: true,
      mileageKmPerDay: true,
      extraKmPrice: true,
      fuelPolicy: true,
      fuelPricePerPercent: true,
    },
  });

  // The rate this rental was actually charged at, not today's list price.
  const dailyRate =
    reservation.rentalDays > 0
      ? money(
          toDecimal(reservation.baseAmount).dividedBy(reservation.rentalDays),
        )
      : money(reservation.baseAmount);

  const late = computeLateReturn({
    scheduledReturnAt: reservation.returnDatetime,
    actualReturnAt: ret.performedAt,
    billing: {
      rule: settings?.billingRule ?? "GRACE_PERIOD",
      gracePeriodMinutes: settings?.gracePeriodMinutes ?? 60,
      extraHourPrice: settings?.extraHourPrice ?? "0",
    },
    dailyRate,
  });

  // Per-vehicle policy overrides the agency default (spec §45).
  const policy =
    reservation.vehicle.mileagePolicy ?? settings?.mileagePolicy ?? "UNLIMITED";
  const kmPerDay =
    reservation.vehicle.mileageKmPerDay ?? settings?.mileageKmPerDay ?? null;
  const extraKmPrice =
    reservation.vehicle.extraKmPrice ?? settings?.extraKmPrice ?? null;

  const mileage =
    pickup?.mileage != null
      ? computeMileageCharge({
          pickupMileage: pickup.mileage,
          returnMileage: ret.mileage,
          billableDays: reservation.rentalDays,
          policy,
          kmPerDay,
          extraKmPrice,
        })
      : null;

  const fuel =
    pickup?.fuelLevel != null
      ? computeFuelCharge({
          pickupLevel: pickup.fuelLevel,
          returnLevel: ret.fuelLevel,
          policy: settings?.fuelPolicy ?? "FULL_TO_FULL",
          pricePerPercent: settings?.fuelPricePerPercent ?? null,
        })
      : null;

  return { late, mileage, fuel };
}

export type SaveReturnInspectionInput = {
  reservationId: string;
  vehicleId: string;
  returnedAt: Date;
  mileage: number;
  fuelLevel: number;
  condition?: string | null;
  notes?: string | null;
  userId: string;
};

export async function saveReturnInspection(
  db: TenantDb,
  input: SaveReturnInspectionInput,
) {
  const agencyId = db.$agencyId;

  const existing = await db.inspection.findFirst({
    where: { reservationId: input.reservationId, type: "RETURN" },
    select: { id: true },
  });

  const data = {
    performedAt: input.returnedAt,
    mileage: input.mileage,
    fuelLevel: input.fuelLevel,
    condition: input.condition || null,
    notes: input.notes || null,
    employeeId: input.userId,
  };

  const inspection = existing
    ? await db.inspection.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      })
    : await db.inspection.create({
        data: {
          agencyId,
          reservationId: input.reservationId,
          vehicleId: input.vehicleId,
          type: "RETURN",
          ...data,
        },
        select: { id: true },
      });

  // The actual return time drives every late calculation, so it lives on the
  // reservation too rather than only on the inspection.
  await db.reservation.update({
    where: { id: input.reservationId },
    data: {
      actualReturnDatetime: input.returnedAt,
      ...(await shouldEnterInspection(db, input.reservationId)),
    },
  });

  return inspection;
}

/** Move an ACTIVE/OVERDUE rental into RETURN_INSPECTION once readings exist. */
async function shouldEnterInspection(db: TenantDb, reservationId: string) {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true },
  });

  const movable = ["ACTIVE", "RETURN_DUE", "OVERDUE"];
  return reservation && movable.includes(reservation.status)
    ? { status: "RETURN_INSPECTION" as const }
    : {};
}

export type AddChargeInput = {
  reservationId: string;
  type: AdditionalChargeType;
  description?: string | null;
  amount: string;
  settleFromDeposit: boolean;
  damageRecordId?: string | null;
  userId: string;
};

/** An additional charge, always confirmed by a person (spec §48). */
export async function addAdditionalCharge(
  db: TenantDb,
  input: AddChargeInput,
) {
  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const charge = await tx.additionalCharge.create({
      data: {
        agencyId,
        reservationId: input.reservationId,
        type: input.type,
        description: input.description || null,
        amount: money(input.amount).toFixed(2),
        settleFromDeposit: input.settleFromDeposit,
        damageRecordId: input.damageRecordId || null,
        createdById: input.userId,
      },
      select: { id: true },
    });

    // A charge the customer pays directly changes what they owe.
    await refreshReservationPayment(tx as TenantDb, input.reservationId);

    await tx.auditLog.create({
      data: {
        agencyId,
        userId: input.userId,
        action: "charge.add",
        entityType: "Reservation",
        entityId: input.reservationId,
        newValue: {
          type: input.type,
          amount: money(input.amount).toFixed(2),
          settleFromDeposit: input.settleFromDeposit,
        },
      },
    });

    return charge;
  });
}

export async function removeAdditionalCharge(
  db: TenantDb,
  reservationId: string,
  chargeId: string,
  userId: string,
) {
  // Captured outside the transaction: the tx client is not guaranteed to carry
  // the client-level extension properties.
  const agencyId = db.$agencyId;

  await db.$transaction(async (tx) => {
    await tx.additionalCharge.deleteMany({
      where: { id: chargeId, reservationId },
    });
    await refreshReservationPayment(tx as TenantDb, reservationId);
    await tx.auditLog.create({
      data: {
        agencyId,
        userId,
        action: "charge.remove",
        entityType: "Reservation",
        entityId: reservationId,
        oldValue: { chargeId },
      },
    });
  });
}

/**
 * Confirm the return damage inspection (spec §47, §49).
 *
 * As at pickup: "compared before and after, found nothing" is a fact worth
 * recording, and is not the same as nobody having looked.
 */
export async function confirmReturnDamageCheck(
  db: TenantDb,
  reservationId: string,
) {
  const inspection = await db.inspection.findFirst({
    where: { reservationId, type: "RETURN" },
    select: { id: true },
  });
  if (!inspection) return null;

  return db.inspection.update({
    where: { id: inspection.id },
    data: { damageCheckedAt: new Date() },
    select: { id: true },
  });
}

/** New damage found at return (spec §47). Never charged automatically. */
export async function recordReturnDamage(
  db: TenantDb,
  input: {
    reservationId: string;
    vehicleId: string;
    inspectionId?: string | null;
    location: string;
    damageType: string;
    description?: string | null;
    estimatedCharge?: string | null;
    userId: string;
  },
) {
  return db.damageRecord.create({
    data: {
      agencyId: db.$agencyId,
      vehicleId: input.vehicleId,
      reservationId: input.reservationId,
      inspectionId: input.inspectionId ?? null,
      location: input.location,
      damageType: input.damageType,
      description: input.description || null,
      isPreExisting: false,
      estimatedCharge: input.estimatedCharge
        ? money(input.estimatedCharge).toFixed(2)
        : null,
      createdById: input.userId,
    },
    select: { id: true },
  });
}

export type CompletionState = {
  returnRecorded: boolean;
  mileageRecorded: boolean;
  fuelRecorded: boolean;
  damageReviewed: boolean;
  paymentsSettled: boolean;
  depositSettled: boolean;
};

export type CompletionCheck = {
  state: CompletionState;
  blockers: string[];
  canComplete: boolean;
};

/**
 * The completion gate (spec §49).
 *
 * Deliberately blunt about money: a rental cannot be closed while the customer
 * still owes something or while their deposit is still being held, because
 * closing it is what makes those balances disappear from the operational views.
 */
export function checkCompletion(
  reservation: ReturnContext,
  depositRequired: boolean,
): CompletionCheck {
  const ret = reservation.inspections.find((i) => i.type === "RETURN");
  const deposit = reservation.securityDeposit;
  const held = deposit ? Number(computeDepositBalance(deposit)) : 0;

  const state: CompletionState = {
    returnRecorded: Boolean(reservation.actualReturnDatetime),
    mileageRecorded: ret?.mileage != null,
    fuelRecorded: ret?.fuelLevel != null,
    damageReviewed: Boolean(ret?.damageCheckedAt),
    paymentsSettled: Number(reservation.amountRemaining) <= 0,
    depositSettled: !depositRequired || held <= 0,
  };

  const blockers: string[] = [];
  if (!state.returnRecorded) blockers.push("The return time has not been recorded.");
  if (!state.mileageRecorded) blockers.push("The closing odometer reading is missing.");
  if (!state.fuelRecorded) blockers.push("The closing fuel level is missing.");
  if (!state.damageReviewed) blockers.push("The damage inspection has not been confirmed.");
  if (!state.paymentsSettled) {
    blockers.push("There is still an outstanding balance to collect.");
  }
  if (!state.depositSettled) {
    blockers.push("The security deposit has not been settled.");
  }

  return { state, blockers, canComplete: blockers.length === 0 };
}

export class ReturnBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super("The rental cannot be completed yet.");
    this.name = "ReturnBlockedError";
  }
}

/**
 * Settle the deposit (spec §33).
 *
 * Retains what the agency charged against it and refunds the rest. The refund is
 * recorded on the deposit, never as a `payments` refund — deposit money never
 * entered revenue, so it must not leave through it either (spec §97.8).
 */
export async function settleReservationDeposit(
  db: TenantDb,
  reservationId: string,
  userId: string,
) {
  const agencyId = db.$agencyId;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      securityDeposit: true,
      additionalCharges: {
        select: { amount: true, settleFromDeposit: true },
      },
    },
  });

  const deposit = reservation?.securityDeposit;
  if (!deposit) return null;

  const held = computeDepositBalance(deposit);
  const fromDeposit = reservation.additionalCharges
    .filter((charge) => charge.settleFromDeposit)
    .map((charge) => charge.amount);

  const settlement = settleDeposit({
    heldAmount: held,
    chargesFromDeposit: fromDeposit,
  });

  await db.securityDeposit.update({
    where: { id: deposit.id },
    data: {
      retainedAmount: sum(deposit.retainedAmount, settlement.retained).toFixed(2),
      refundedAmount: sum(deposit.refundedAmount, settlement.refund).toFixed(2),
      status:
        Number(settlement.retained) > 0
          ? Number(settlement.refund) > 0
            ? "PARTIALLY_REFUNDED"
            : "RETAINED"
          : "REFUNDED",
      settledAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      agencyId,
      userId,
      action: "deposit.settle",
      entityType: "Reservation",
      entityId: reservationId,
      newValue: {
        retained: settlement.retained,
        refunded: settlement.refund,
        shortfall: settlement.shortfall,
      },
    },
  });

  return settlement;
}

/**
 * Close the rental (spec §49).
 *
 * The vehicle's occupancy block is rewritten to end at the real return time plus
 * the turnaround buffer — a car back early frees up sooner, and one back late
 * keeps its cleaning window. If that window now overlaps a booking somebody else
 * made, the block is dropped rather than forced: the calendar showing the real
 * next booking is more useful than a constraint error, and the overlap is a
 * conversation the agency has to have anyway.
 */
export async function completeRental(
  db: TenantDb,
  reservationId: string,
  userId: string,
  check: CompletionCheck,
) {
  if (!check.canComplete) throw new ReturnBlockedError(check.blockers);

  const agencyId = db.$agencyId;

  const settings = await db.agencySettings.findFirst({
    select: { bufferMinutes: true },
  });
  const bufferMinutes = settings?.bufferMinutes ?? 0;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      actualReturnDatetime: true,
      damageRecords: {
        where: { isPreExisting: false },
        select: { id: true },
      },
      inspections: {
        where: { type: "RETURN" },
        take: 1,
        select: { mileage: true },
      },
    },
  });
  if (!reservation) throw new Error("Reservation not found");

  const returnedAt = reservation.actualReturnDatetime ?? new Date();
  const hasNewDamage = reservation.damageRecords.length > 0;

  await db.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const mileage = reservation.inspections[0]?.mileage;
    await tx.vehicle.update({
      where: { id: reservation.vehicleId },
      data: {
        // New damage takes the car off the road until someone looks at it.
        currentStatus: hasNewDamage ? "MAINTENANCE" : "AVAILABLE",
        ...(mileage != null ? { currentMileage: mileage } : {}),
      },
    });

    try {
      await tx.vehicleBlock.updateMany({
        where: { reservationId },
        data: {
          startsAt: returnedAt,
          endsAt: withBuffer(returnedAt, bufferMinutes),
          bufferMinutes,
        },
      });
    } catch (error) {
      if (!isVehicleOverlapViolation(error)) throw error;
      await tx.vehicleBlock.deleteMany({ where: { reservationId } });
    }

    await tx.reservationStatusHistory.create({
      data: {
        agencyId,
        reservationId,
        fromStatus: reservation.status,
        toStatus: "COMPLETED",
        changedById: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        agencyId,
        userId,
        action: "reservation.complete",
        entityType: "Reservation",
        entityId: reservationId,
        newValue: {
          returnedAt: returnedAt.toISOString(),
          newDamage: hasNewDamage,
        },
      },
    });
  });

  return { id: reservationId, vehicleNeedsMaintenance: hasNewDamage };
}
