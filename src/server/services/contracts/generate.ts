import type { TenantDb } from "@/server/tenant";
import { formatContractNumber } from "./number";
import type { ContractSnapshot } from "./snapshot";

/**
 * Contract generation and versioning (spec §50, §88).
 *
 * The integrity rule: a signed contract is never touched again. Regenerating
 * after a signature produces version N+1 under the same contract number, marks
 * the previous version SUPERSEDED, and leaves its snapshot, its signature and
 * its timestamp exactly where they were. An unsigned draft, by contrast, is
 * simply refreshed — nobody has agreed to it yet.
 */

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

async function buildSnapshot(
  db: TenantDb,
  reservationId: string,
): Promise<ContractSnapshot> {
  const [reservation, agency, contractSettings, agencySettings] =
    await Promise.all([
      db.reservation.findUnique({
        where: { id: reservationId },
        select: {
          bookingReference: true,
          pickupDatetime: true,
          returnDatetime: true,
          rentalDays: true,
          finalTotal: true,
          amountPaid: true,
          securityDepositRequired: true,
          currency: true,
          pricingBreakdown: true,
          customer: {
            select: {
              fullName: true,
              phone: true,
              email: true,
              nationality: true,
              documents: {
                select: {
                  documentType: true,
                  documentNumber: true,
                  expiryDate: true,
                  verificationStatus: true,
                },
              },
            },
          },
          vehicle: {
            select: {
              brand: true,
              model: true,
              year: true,
              registrationNumber: true,
              vin: true,
              color: true,
              transmission: true,
              fuelType: true,
              seats: true,
            },
          },
          pickupLocation: { select: { name: true } },
          returnLocation: { select: { name: true } },
          inspections: {
            where: { type: "PICKUP" },
            take: 1,
            select: { mileage: true, fuelLevel: true },
          },
          payments: {
            where: { status: "COMPLETED" },
            orderBy: { createdAt: "asc" },
            select: {
              type: true,
              method: true,
              amount: true,
              createdAt: true,
            },
          },
        },
      }),
      db.agency.findFirst({
        select: {
          name: true,
          address: true,
          city: true,
          phone: true,
          email: true,
          logoFile: { select: { publicUrl: true } },
        },
      }),
      db.contractSettings.findFirst({
        select: {
          legalName: true,
          registrationNumber: true,
          taxId: true,
          termsAndConditions: true,
          fuelPolicyText: true,
          mileagePolicyText: true,
          damagePolicyText: true,
          cancellationText: true,
          depositPolicyText: true,
          footerText: true,
        },
      }),
      db.agencySettings.findFirst({
        select: { minDriverAge: true, minLicenceYears: true },
      }),
    ]);

  if (!reservation) throw new ContractError("Reservation not found.");
  if (!agency) throw new ContractError("Agency not found.");

  const inspection = reservation.inspections[0];
  const lines = Array.isArray(reservation.pricingBreakdown)
    ? (reservation.pricingBreakdown as ContractSnapshot["pricing"]["lines"])
    : [];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),

    agency: {
      name: agency.name,
      legalName: contractSettings?.legalName ?? null,
      registrationNumber: contractSettings?.registrationNumber ?? null,
      taxId: contractSettings?.taxId ?? null,
      address: agency.address,
      city: agency.city,
      phone: agency.phone,
      email: agency.email,
      logoUrl: agency.logoFile?.publicUrl ?? null,
    },

    customer: {
      fullName: reservation.customer.fullName,
      phone: reservation.customer.phone,
      email: reservation.customer.email,
      nationality: reservation.customer.nationality,
      // Only verified documents go on the contract (spec §50).
      documents: reservation.customer.documents
        .filter((document) => document.verificationStatus === "VERIFIED")
        .map((document) => ({
          type: document.documentType,
          number: document.documentNumber,
          expiry: document.expiryDate?.toISOString() ?? null,
          verified: true,
        })),
    },

    vehicle: {
      brand: reservation.vehicle.brand,
      model: reservation.vehicle.model,
      year: reservation.vehicle.year,
      registrationNumber: reservation.vehicle.registrationNumber,
      vin: reservation.vehicle.vin,
      color: reservation.vehicle.color,
      transmission: reservation.vehicle.transmission,
      fuelType: reservation.vehicle.fuelType,
      seats: reservation.vehicle.seats,
      mileageAtPickup: inspection?.mileage ?? null,
      fuelAtPickup: inspection?.fuelLevel ?? null,
    },

    rental: {
      bookingReference: reservation.bookingReference,
      pickupAt: reservation.pickupDatetime.toISOString(),
      returnAt: reservation.returnDatetime.toISOString(),
      pickupLocation: reservation.pickupLocation.name,
      returnLocation: reservation.returnLocation.name,
      rentalDays: reservation.rentalDays,
    },

    pricing: {
      currency: reservation.currency,
      lines,
      total: reservation.finalTotal.toString(),
      securityDeposit: reservation.securityDepositRequired.toString(),
      amountPaidAtGeneration: reservation.amountPaid.toString(),
    },

    payments: reservation.payments.map((payment) => ({
      type: payment.type,
      method: payment.method,
      amount: payment.amount.toString(),
      at: payment.createdAt.toISOString(),
    })),

    conditions: {
      terms: contractSettings?.termsAndConditions ?? null,
      fuelPolicy: contractSettings?.fuelPolicyText ?? null,
      mileagePolicy: contractSettings?.mileagePolicyText ?? null,
      damagePolicy: contractSettings?.damagePolicyText ?? null,
      cancellation: contractSettings?.cancellationText ?? null,
      depositPolicy: contractSettings?.depositPolicyText ?? null,
      footer: contractSettings?.footerText ?? null,
      minDriverAge: agencySettings?.minDriverAge ?? null,
      minLicenceYears: agencySettings?.minLicenceYears ?? null,
    },
  };
}

export type GenerateResult = {
  contractId: string;
  contractNumber: string;
  version: number;
  /** True when a signed version was superseded rather than refreshed */
  amended: boolean;
};

export async function generateContract(
  db: TenantDb,
  reservationId: string,
  userId: string,
): Promise<GenerateResult> {
  const agencyId = db.$agencyId;
  const snapshot = await buildSnapshot(db, reservationId);

  const existing = await db.contract.findMany({
    where: { reservationId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      contractNumber: true,
      version: true,
      status: true,
    },
  });

  const latest = existing[0];

  return db.$transaction(async (tx) => {
    // An unsigned draft has been agreed by nobody: refresh it in place rather
    // than burning a contract number on every edit.
    if (latest && latest.status !== "SIGNED" && latest.status !== "SUPERSEDED") {
      const refreshed = await tx.contract.update({
        where: { id: latest.id },
        data: {
          contentSnapshot: JSON.parse(JSON.stringify(snapshot)),
          status: "ISSUED",
          generatedById: userId,
          generatedAt: new Date(),
        },
        select: { id: true, contractNumber: true, version: true },
      });

      return {
        contractId: refreshed.id,
        contractNumber: refreshed.contractNumber,
        version: refreshed.version,
        amended: false,
      };
    }

    // A signed contract is preserved untouched; this becomes an amendment
    // under the same number (spec §52, §88).
    let contractNumber: string;
    let version: number;

    if (latest) {
      contractNumber = latest.contractNumber;
      version = latest.version + 1;
      await tx.contract.update({
        where: { id: latest.id },
        data: { status: "SUPERSEDED" },
      });
    } else {
      const settings = await tx.contractSettings.findFirst({
        select: { id: true, numberPrefix: true },
      });
      if (!settings) {
        throw new ContractError(
          "Contract settings are not configured for this agency.",
        );
      }

      // Atomic: `increment` is resolved by the database, so two concurrent
      // generations cannot take the same number.
      const bumped = await tx.contractSettings.update({
        where: { id: settings.id },
        data: { nextSequence: { increment: 1 } },
        select: { nextSequence: true },
      });

      contractNumber = formatContractNumber(
        settings.numberPrefix,
        new Date().getUTCFullYear(),
        bumped.nextSequence - 1,
      );
      version = 1;
    }

    const created = await tx.contract.create({
      data: {
        agencyId,
        reservationId,
        contractNumber,
        version,
        status: "ISSUED",
        contentSnapshot: JSON.parse(JSON.stringify(snapshot)),
        supersedesId: latest?.id ?? null,
        generatedById: userId,
      },
      select: { id: true, contractNumber: true, version: true },
    });

    await tx.auditLog.create({
      data: {
        agencyId,
        userId,
        action: latest ? "contract.amend" : "contract.generate",
        entityType: "Contract",
        entityId: created.id,
        newValue: { contractNumber, version },
      },
    });

    return {
      contractId: created.id,
      contractNumber: created.contractNumber,
      version: created.version,
      amended: Boolean(latest),
    };
  });
}

export async function getContractForReservation(
  db: TenantDb,
  reservationId: string,
) {
  return db.contract.findFirst({
    where: { reservationId },
    orderBy: { version: "desc" },
    include: {
      signature: true,
      generatedBy: { select: { fullName: true } },
    },
  });
}

export async function listContractVersions(
  db: TenantDb,
  reservationId: string,
) {
  return db.contract.findMany({
    where: { reservationId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      contractNumber: true,
      version: true,
      status: true,
      generatedAt: true,
      signature: { select: { signedAt: true, signerName: true } },
    },
  });
}
