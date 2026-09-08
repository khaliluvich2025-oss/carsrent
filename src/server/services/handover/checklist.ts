import type { ChecklistRequirement } from "@prisma/client";

/**
 * The configurable pickup checklist (spec §40).
 *
 * Pure: settings plus observed state in, step statuses and a completion verdict
 * out. Handover is the moment the agency hands over a car worth more than
 * everything else in the transaction, so the rule that decides whether it may
 * complete should be provable without a database.
 *
 * `capabilities` exists because a step can be required by the agency but not yet
 * buildable — contract generation and signature arrive with Phase 9. Rather than
 * pretending those steps pass, the gate blocks and says exactly why.
 */

export const HANDOVER_STEPS = [
  "documents",
  "mileage",
  "fuel",
  "photos",
  "damage",
  "payment",
  "deposit",
  "contract",
  "signature",
] as const;

export type HandoverStepKey = (typeof HANDOVER_STEPS)[number];

export type ChecklistSettings = Record<HandoverStepKey, ChecklistRequirement>;

export type HandoverState = {
  documentsVerified: boolean;
  mileageRecorded: boolean;
  fuelRecorded: boolean;
  photoCount: number;
  /** The employee has actively confirmed the damage walk-around */
  damageChecked: boolean;
  paymentSettled: boolean;
  depositSettled: boolean;
  contractGenerated: boolean;
  contractSigned: boolean;
};

/** Features that exist in this build. */
export type HandoverCapabilities = {
  /** Photo upload needs object storage to be configured */
  photos: boolean;
  /** Contract generation and signature arrive in Phase 9 */
  contracts: boolean;
};

export type ChecklistStep = {
  key: HandoverStepKey;
  label: string;
  description: string;
  requirement: ChecklistRequirement;
  done: boolean;
  /** Required, not done, and therefore stopping completion */
  blocking: boolean;
  /** Required by the agency but not available in this build */
  unavailable: boolean;
};

export type ChecklistResult = {
  steps: ChecklistStep[];
  canComplete: boolean;
  blockers: string[];
  /** Steps done out of steps that are not disabled */
  progress: { done: number; total: number };
};

const LABELS: Record<
  HandoverStepKey,
  { label: string; description: string }
> = {
  documents: {
    label: "Customer documents",
    description: "Driving licence and ID checked against the person in front of you.",
  },
  mileage: {
    label: "Odometer reading",
    description: "Recorded now so the distance travelled can be proved at return.",
  },
  fuel: {
    label: "Fuel level",
    description: "The level the car leaves with.",
  },
  photos: {
    label: "Before photos",
    description: "The condition evidence for any dispute at return.",
  },
  damage: {
    label: "Existing damage",
    description: "Recorded before handover so it is never charged to this customer.",
  },
  payment: {
    label: "Rental payment",
    description: "What is owed for the rental itself.",
  },
  deposit: {
    label: "Security deposit",
    description: "Held on behalf of the customer, not revenue.",
  },
  contract: {
    label: "Rental contract",
    description: "Generated from this reservation.",
  },
  signature: {
    label: "Customer signature",
    description: "Signed on screen and stored with the contract.",
  },
};

function isDone(key: HandoverStepKey, state: HandoverState): boolean {
  switch (key) {
    case "documents":
      return state.documentsVerified;
    case "mileage":
      return state.mileageRecorded;
    case "fuel":
      return state.fuelRecorded;
    case "photos":
      return state.photoCount > 0;
    case "damage":
      return state.damageChecked;
    case "payment":
      return state.paymentSettled;
    case "deposit":
      return state.depositSettled;
    case "contract":
      return state.contractGenerated;
    case "signature":
      return state.contractSigned;
  }
}

function isAvailable(
  key: HandoverStepKey,
  capabilities: HandoverCapabilities,
): boolean {
  if (key === "photos") return capabilities.photos;
  if (key === "contract" || key === "signature") return capabilities.contracts;
  return true;
}

export function evaluateChecklist(
  settings: ChecklistSettings,
  state: HandoverState,
  capabilities: HandoverCapabilities,
): ChecklistResult {
  const steps: ChecklistStep[] = [];
  const blockers: string[] = [];
  let done = 0;
  let total = 0;

  for (const key of HANDOVER_STEPS) {
    const requirement = settings[key];
    if (requirement === "DISABLED") continue;

    const stepDone = isDone(key, state);
    const available = isAvailable(key, capabilities);
    const required = requirement === "REQUIRED";
    const unavailable = required && !available && !stepDone;
    const blocking = required && !stepDone;

    total += 1;
    if (stepDone) done += 1;

    steps.push({
      key,
      label: LABELS[key].label,
      description: LABELS[key].description,
      requirement,
      done: stepDone,
      blocking,
      unavailable,
    });

    if (blocking) {
      blockers.push(
        unavailable
          ? `${LABELS[key].label} is required but is not available yet in this build — set it to Optional in Settings to continue.`
          : `${LABELS[key].label} is required and has not been completed.`,
      );
    }
  }

  return {
    steps,
    canComplete: blockers.length === 0,
    blockers,
    progress: { done, total },
  };
}
