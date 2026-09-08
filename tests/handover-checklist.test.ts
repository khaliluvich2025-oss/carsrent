import { describe, expect, it } from "vitest";

import {
  evaluateChecklist,
  HANDOVER_STEPS,
  type ChecklistSettings,
  type HandoverCapabilities,
  type HandoverState,
} from "@/server/services/handover/checklist";

const allRequired: ChecklistSettings = {
  documents: "REQUIRED",
  mileage: "REQUIRED",
  fuel: "REQUIRED",
  photos: "REQUIRED",
  damage: "REQUIRED",
  payment: "REQUIRED",
  deposit: "REQUIRED",
  contract: "REQUIRED",
  signature: "REQUIRED",
};

const nothingDone: HandoverState = {
  documentsVerified: false,
  mileageRecorded: false,
  fuelRecorded: false,
  photoCount: 0,
  damageChecked: false,
  paymentSettled: false,
  depositSettled: false,
  contractGenerated: false,
  contractSigned: false,
};

const allDone: HandoverState = {
  documentsVerified: true,
  mileageRecorded: true,
  fuelRecorded: true,
  photoCount: 4,
  damageChecked: true,
  paymentSettled: true,
  depositSettled: true,
  contractGenerated: true,
  contractSigned: true,
};

const fullCapabilities: HandoverCapabilities = { photos: true, contracts: true };

/** spec §40 */
describe("pickup checklist", () => {
  it("blocks completion when nothing is done", () => {
    const result = evaluateChecklist(allRequired, nothingDone, fullCapabilities);
    expect(result.canComplete).toBe(false);
    expect(result.blockers).toHaveLength(HANDOVER_STEPS.length);
  });

  it("allows completion when every required step is done", () => {
    const result = evaluateChecklist(allRequired, allDone, fullCapabilities);
    expect(result.canComplete).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.progress).toEqual({ done: 9, total: 9 });
  });

  it("hides disabled steps entirely rather than passing them", () => {
    const settings: ChecklistSettings = {
      ...allRequired,
      photos: "DISABLED",
      contract: "DISABLED",
      signature: "DISABLED",
    };
    const result = evaluateChecklist(settings, nothingDone, fullCapabilities);

    expect(result.steps.map((step) => step.key)).not.toContain("photos");
    expect(result.progress.total).toBe(6);
  });

  it("does not block on an optional step", () => {
    const settings: ChecklistSettings = { ...allRequired, photos: "OPTIONAL" };
    const state: HandoverState = { ...allDone, photoCount: 0 };

    const result = evaluateChecklist(settings, state, fullCapabilities);
    expect(result.canComplete).toBe(true);
    // Still listed, still shown as not done — just not blocking.
    const photos = result.steps.find((step) => step.key === "photos");
    expect(photos?.done).toBe(false);
    expect(photos?.blocking).toBe(false);
  });

  it("blocks a single missing required step and names it", () => {
    const state: HandoverState = { ...allDone, documentsVerified: false };
    const result = evaluateChecklist(allRequired, state, fullCapabilities);

    expect(result.canComplete).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("Customer documents");
  });

  it("counts a deposit that is not required as settled", () => {
    // depositSettled is computed upstream; here it simply passes through.
    const state: HandoverState = { ...allDone, depositSettled: true };
    expect(evaluateChecklist(allRequired, state, fullCapabilities).canComplete).toBe(
      true,
    );
  });

  describe("capabilities that do not exist yet", () => {
    const noContracts: HandoverCapabilities = { photos: true, contracts: false };

    it("blocks a required step that this build cannot perform", () => {
      const state: HandoverState = {
        ...allDone,
        contractGenerated: false,
        contractSigned: false,
      };
      const result = evaluateChecklist(allRequired, state, noContracts);

      expect(result.canComplete).toBe(false);
      expect(result.steps.find((s) => s.key === "contract")?.unavailable).toBe(
        true,
      );
    });

    it("explains how to unblock rather than just refusing", () => {
      const state: HandoverState = { ...allDone, contractGenerated: false };
      const result = evaluateChecklist(allRequired, state, noContracts);

      expect(result.blockers.join(" ")).toContain("set it to Optional");
    });

    it("does not block when the unavailable step is optional", () => {
      const settings: ChecklistSettings = {
        ...allRequired,
        contract: "OPTIONAL",
        signature: "OPTIONAL",
      };
      const state: HandoverState = {
        ...allDone,
        contractGenerated: false,
        contractSigned: false,
      };
      expect(evaluateChecklist(settings, state, noContracts).canComplete).toBe(
        true,
      );
    });

    it("does not mark a step unavailable once it is already done", () => {
      // A contract generated before the capability was disabled still counts.
      const state: HandoverState = { ...allDone };
      const result = evaluateChecklist(allRequired, state, noContracts);
      expect(result.steps.find((s) => s.key === "contract")?.unavailable).toBe(
        false,
      );
      expect(result.canComplete).toBe(true);
    });

    it("blocks required photos when storage is not configured", () => {
      const state: HandoverState = { ...allDone, photoCount: 0 };
      const result = evaluateChecklist(allRequired, state, {
        photos: false,
        contracts: true,
      });
      expect(result.canComplete).toBe(false);
      expect(result.steps.find((s) => s.key === "photos")?.unavailable).toBe(true);
    });
  });

  it("reports progress over non-disabled steps only", () => {
    const settings: ChecklistSettings = {
      ...allRequired,
      photos: "DISABLED",
      contract: "DISABLED",
      signature: "DISABLED",
    };
    const state: HandoverState = { ...nothingDone, documentsVerified: true };

    const result = evaluateChecklist(settings, state, fullCapabilities);
    expect(result.progress).toEqual({ done: 1, total: 6 });
  });
});
