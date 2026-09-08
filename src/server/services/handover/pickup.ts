import type { DocumentType } from "@prisma/client";

import type { TenantDb } from "@/server/tenant";
import { isStorageConfigured } from "@/server/storage";
import { computeDepositBalance } from "@/server/services/payments/rollup";
import {
  evaluateChecklist,
  type ChecklistResult,
  type ChecklistSettings,
  type HandoverState,
} from "./checklist";

/**
 * The pickup / handover flow (spec §37–§41).
 *
 * The screen is a set of independent steps rather than a wizard: an employee at
 * an airport kerb gets interrupted, and losing a half-finished handover because
 * they took a phone call is not acceptable. Every step saves on its own, and the
 * completion gate decides at the end whether the required ones are done.
 */

export async function getHandover(db: TenantDb, reservationId: string) {
  return db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      bookingReference: true,
      status: true,
      pickupDatetime: true,
      returnDatetime: true,
      finalTotal: true,
      amountPaid: true,
      amountRemaining: true,
      securityDepositRequired: true,
      currency: true,
      customerId: true,
      vehicleId: true,
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
          status: true,
          documents: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              documentType: true,
              documentNumber: true,
              expiryDate: true,
              verificationStatus: true,
              verifiedAt: true,
            },
          },
        },
      },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          registrationNumber: true,
          currentMileage: true,
          fuelType: true,
          transmission: true,
        },
      },
      pickupLocation: { select: { name: true } },
      securityDeposit: true,
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          method: true,
          createdAt: true,
          createdBy: { select: { fullName: true } },
        },
      },
      inspections: {
        where: { type: "PICKUP" },
        take: 1,
        select: {
          id: true,
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
        where: { isPreExisting: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          location: true,
          damageType: true,
          description: true,
          createdAt: true,
        },
      },
      contracts: { select: { id: true, status: true } },
    },
  });
}

export type HandoverData = NonNullable<Awaited<ReturnType<typeof getHandover>>>;

/**
 * A vehicle's condition is only "recorded" once an inspection exists. A mileage
 * of 0 is a legitimate reading on a brand-new car, so the presence of the row —
 * not a truthy value — is what marks the step done.
 */
export function buildHandoverState(reservation: HandoverData): HandoverState {
  const inspection = reservation.inspections[0];
  const deposit = reservation.securityDeposit;

  const requiredDeposit = Number(reservation.securityDepositRequired);
  const heldDeposit = deposit ? Number(computeDepositBalance(deposit)) : 0;

  const verifiedDocuments = reservation.customer.documents.filter(
    (document) => document.verificationStatus === "VERIFIED",
  );

  return {
    // A licence is the one document that is never optional to check.
    documentsVerified: verifiedDocuments.some(
      (document) => document.documentType === "DRIVING_LICENCE",
    ),
    // `!= null` rather than truthiness: 0 km is a legitimate reading on a new
    // car, and an empty tank is a legitimate fuel level.
    mileageRecorded: inspection?.mileage != null,
    fuelRecorded: inspection?.fuelLevel != null,
    photoCount: inspection?.photos.length ?? 0,
    // "No damage found" and "not checked yet" are different facts, so this is
    // an explicit confirmation rather than "are there damage rows?".
    damageChecked: Boolean(inspection?.damageCheckedAt),
    paymentSettled: Number(reservation.amountRemaining) <= 0,
    depositSettled: requiredDeposit <= 0 || heldDeposit >= requiredDeposit,
    contractGenerated: reservation.contracts.length > 0,
    contractSigned: reservation.contracts.some(
      (contract) => contract.status === "SIGNED",
    ),
  };
}

export async function getChecklist(
  db: TenantDb,
  reservation: HandoverData,
): Promise<ChecklistResult> {
  const settings = await db.agencySettings.findFirst({
    select: {
      requireDocuments: true,
      requireMileage: true,
      requireFuel: true,
      requirePhotos: true,
      requireDamageCheck: true,
      requirePayment: true,
      requireDeposit: true,
      requireContract: true,
      requireSignature: true,
    },
  });

  const checklistSettings: ChecklistSettings = {
    documents: settings?.requireDocuments ?? "REQUIRED",
    mileage: settings?.requireMileage ?? "REQUIRED",
    fuel: settings?.requireFuel ?? "REQUIRED",
    photos: settings?.requirePhotos ?? "REQUIRED",
    damage: settings?.requireDamageCheck ?? "REQUIRED",
    payment: settings?.requirePayment ?? "REQUIRED",
    deposit: settings?.requireDeposit ?? "REQUIRED",
    contract: settings?.requireContract ?? "REQUIRED",
    signature: settings?.requireSignature ?? "REQUIRED",
  };

  return evaluateChecklist(
    checklistSettings,
    buildHandoverState(reservation),
    {
      photos: isStorageConfigured(),
      contracts: true,
    },
  );
}

export type SaveInspectionInput = {
  reservationId: string;
  vehicleId: string;
  mileage: number;
  fuelLevel: number;
  condition?: string | null;
  notes?: string | null;
  userId: string;
};

/**
 * Record the vehicle's condition at handover (spec §38).
 *
 * Upserted, so an employee who mistyped the odometer can correct it before
 * completing — but only before. Once the handover completes the reading is the
 * baseline every return charge is measured from.
 */
export async function savePickupInspection(
  db: TenantDb,
  input: SaveInspectionInput,
) {
  const agencyId = db.$agencyId;

  const existing = await db.inspection.findFirst({
    where: { reservationId: input.reservationId, type: "PICKUP" },
    select: { id: true },
  });

  if (existing) {
    return db.inspection.update({
      where: { id: existing.id },
      data: {
        mileage: input.mileage,
        fuelLevel: input.fuelLevel,
        condition: input.condition || null,
        notes: input.notes || null,
        employeeId: input.userId,
      },
      select: { id: true },
    });
  }

  return db.inspection.create({
    data: {
      agencyId,
      reservationId: input.reservationId,
      vehicleId: input.vehicleId,
      type: "PICKUP",
      performedAt: new Date(),
      mileage: input.mileage,
      fuelLevel: input.fuelLevel,
      condition: input.condition || null,
      notes: input.notes || null,
      employeeId: input.userId,
    },
    select: { id: true },
  });
}

export type DocumentInput = {
  customerId: string;
  documentType: DocumentType;
  documentNumber?: string | null;
  expiryDate?: Date | null;
  verified: boolean;
  rejectionReason?: string | null;
};

/**
 * Record a document check (spec §36).
 *
 * The file itself is optional: what matters operationally is that a named
 * employee confirmed they saw the licence and it matched the person. Attaching a
 * scan is useful, but blocking a handover on object storage being configured
 * would be the wrong trade at an airport kerb.
 */
export async function saveCustomerDocument(
  db: TenantDb,
  input: DocumentInput,
) {
  const agencyId = db.$agencyId;

  const existing = await db.customerDocument.findFirst({
    where: { customerId: input.customerId, documentType: input.documentType },
    select: { id: true },
  });

  const data = {
    documentNumber: input.documentNumber || null,
    expiryDate: input.expiryDate ?? null,
    verificationStatus: input.verified
      ? ("VERIFIED" as const)
      : ("REJECTED" as const),
    verifiedAt: input.verified ? new Date() : null,
    rejectionReason: input.verified ? null : input.rejectionReason || null,
  };

  if (existing) {
    return db.customerDocument.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }

  return db.customerDocument.create({
    data: {
      agencyId,
      customerId: input.customerId,
      documentType: input.documentType,
      ...data,
    },
    select: { id: true },
  });
}

export type DamageInput = {
  reservationId: string;
  vehicleId: string;
  inspectionId?: string | null;
  location: string;
  damageType: string;
  description?: string | null;
  userId: string;
};

/**
 * Confirm the damage walk-around was done (spec §39, §40).
 *
 * Recorded on the inspection, so "we looked and found nothing" is a fact with a
 * timestamp rather than an absence of rows.
 */
export async function confirmDamageCheck(
  db: TenantDb,
  reservationId: string,
  vehicleId: string,
  userId: string,
) {
  const existing = await db.inspection.findFirst({
    where: { reservationId, type: "PICKUP" },
    select: { id: true },
  });

  if (existing) {
    return db.inspection.update({
      where: { id: existing.id },
      data: { damageCheckedAt: new Date() },
      select: { id: true },
    });
  }

  // The walk-around can be confirmed before the odometer is typed in; create a
  // shell inspection rather than losing the confirmation.
  return db.inspection.create({
    data: {
      agencyId: db.$agencyId,
      reservationId,
      vehicleId,
      type: "PICKUP",
      performedAt: new Date(),
      damageCheckedAt: new Date(),
      employeeId: userId,
    },
    select: { id: true },
  });
}

/** Existing damage, recorded before the car leaves (spec §39). */
export async function recordExistingDamage(db: TenantDb, input: DamageInput) {
  return db.damageRecord.create({
    data: {
      agencyId: db.$agencyId,
      vehicleId: input.vehicleId,
      reservationId: input.reservationId,
      inspectionId: input.inspectionId ?? null,
      location: input.location,
      damageType: input.damageType,
      description: input.description || null,
      // Pre-existing: never chargeable to this customer (spec §39).
      isPreExisting: true,
      createdById: input.userId,
    },
    select: { id: true },
  });
}

export class HandoverBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super("The handover checklist is not complete.");
    this.name = "HandoverBlockedError";
  }
}

/**
 * Complete the handover (spec §41).
 *
 * The reservation becomes ACTIVE, the vehicle reads RENTED, and the odometer is
 * brought up to the reading just taken. The actual handover time is stored
 * separately from the scheduled one, because late collections are normal and the
 * return calculation needs the real figure.
 */
export async function completeHandover(
  db: TenantDb,
  reservationId: string,
  userId: string,
  checklist: ChecklistResult,
) {
  if (!checklist.canComplete) {
    throw new HandoverBlockedError(checklist.blockers);
  }

  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        inspections: {
          where: { type: "PICKUP" },
          take: 1,
          select: { mileage: true },
        },
      },
    });
    if (!reservation) throw new Error("Reservation not found");

    if (
      reservation.status !== "CONFIRMED" &&
      reservation.status !== "READY_FOR_PICKUP"
    ) {
      throw new HandoverBlockedError([
        "Only a confirmed reservation can be handed over.",
      ]);
    }

    const now = new Date();

    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "ACTIVE", actualPickupDatetime: now },
    });

    const mileage = reservation.inspections[0]?.mileage;
    await tx.vehicle.update({
      where: { id: reservation.vehicleId },
      data: {
        currentStatus: "RENTED",
        ...(mileage != null ? { currentMileage: mileage } : {}),
      },
    });

    await tx.reservationStatusHistory.create({
      data: {
        agencyId,
        reservationId,
        fromStatus: reservation.status,
        toStatus: "ACTIVE",
        changedById: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        agencyId,
        userId,
        action: "reservation.handover_complete",
        entityType: "Reservation",
        entityId: reservationId,
        newValue: { actualPickupDatetime: now.toISOString() },
      },
    });

    return { id: reservationId };
  });
}
