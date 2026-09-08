/**
 * The contract snapshot (spec §50, §88).
 *
 * A contract is not a view over live data — it is a record of what was agreed at
 * a moment in time. Everything it displays is copied in here at generation, so a
 * later price change, vehicle edit or policy rewrite can never alter a document
 * the customer has already signed.
 *
 * The shape is deliberately plain JSON: it is stored in a `Json` column and must
 * stay readable years later without needing this codebase to interpret it.
 */

export type ContractSnapshot = {
  /** Bumped if the shape ever changes, so old contracts stay readable */
  schemaVersion: 1;
  generatedAt: string;

  agency: {
    name: string;
    legalName: string | null;
    registrationNumber: string | null;
    taxId: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  };

  customer: {
    fullName: string;
    phone: string;
    email: string | null;
    nationality: string | null;
    documents: {
      type: string;
      number: string | null;
      expiry: string | null;
      verified: boolean;
    }[];
  };

  vehicle: {
    brand: string;
    model: string;
    year: number;
    registrationNumber: string;
    vin: string | null;
    color: string | null;
    transmission: string;
    fuelType: string;
    seats: number;
    mileageAtPickup: number | null;
    fuelAtPickup: number | null;
  };

  rental: {
    bookingReference: string;
    pickupAt: string;
    returnAt: string;
    pickupLocation: string;
    returnLocation: string;
    rentalDays: number;
  };

  pricing: {
    currency: string;
    lines: { label: string; detail?: string; amount: string }[];
    total: string;
    securityDeposit: string;
    amountPaidAtGeneration: string;
  };

  payments: {
    type: string;
    method: string;
    amount: string;
    at: string;
  }[];

  conditions: {
    terms: string | null;
    fuelPolicy: string | null;
    mileagePolicy: string | null;
    damagePolicy: string | null;
    cancellation: string | null;
    depositPolicy: string | null;
    footer: string | null;
    minDriverAge: number | null;
    minLicenceYears: number | null;
  };
};

/** Narrow an unknown Json column back into a snapshot for rendering. */
export function asSnapshot(value: unknown): ContractSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ContractSnapshot>;
  return candidate.schemaVersion === 1 ? (candidate as ContractSnapshot) : null;
}
