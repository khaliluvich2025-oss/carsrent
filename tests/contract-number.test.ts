import { describe, expect, it } from "vitest";

import {
  formatContractNumber,
  parseContractNumber,
} from "@/server/services/contracts/number";
import { asSnapshot } from "@/server/services/contracts/snapshot";

/** spec §50 */
describe("contract numbering", () => {
  it("produces the spec's format", () => {
    expect(formatContractNumber("CTR", 2026, 128)).toBe("CTR-2026-00128");
  });

  it("pads short sequences and keeps long ones intact", () => {
    expect(formatContractNumber("CTR", 2026, 1)).toBe("CTR-2026-00001");
    expect(formatContractNumber("CTR", 2026, 123456)).toBe("CTR-2026-123456");
  });

  it("normalises a messy prefix rather than emitting it raw", () => {
    expect(formatContractNumber("  ctr ", 2026, 7)).toBe("CTR-2026-00007");
    expect(formatContractNumber("AT-LAS", 2026, 7)).toBe("ATLAS-2026-00007");
  });

  it("falls back to CTR when the prefix is unusable", () => {
    expect(formatContractNumber("", 2026, 7)).toBe("CTR-2026-00007");
    expect(formatContractNumber("!!!", 2026, 7)).toBe("CTR-2026-00007");
  });

  it("round-trips through the parser", () => {
    const value = formatContractNumber("CTR", 2026, 128);
    expect(parseContractNumber(value)).toEqual({
      prefix: "CTR",
      year: 2026,
      sequence: 128,
    });
  });

  it("rejects anything that is not a contract number", () => {
    expect(parseContractNumber("RNT-ABC123")).toBeNull();
    expect(parseContractNumber("CTR-26-1")).toBeNull();
    expect(parseContractNumber("")).toBeNull();
  });

  it("sorts lexicographically in the same order as numerically", () => {
    // Zero-padding is what makes a plain string sort correct in reports.
    const numbers = [1, 2, 10, 128, 9999].map((sequence) =>
      formatContractNumber("CTR", 2026, sequence),
    );
    expect([...numbers].sort()).toEqual(numbers);
  });
});

/** spec §88 — a contract renders from its own frozen snapshot */
describe("contract snapshot", () => {
  it("accepts a well-formed snapshot", () => {
    expect(asSnapshot({ schemaVersion: 1, generatedAt: "x" })).not.toBeNull();
  });

  it("rejects anything without a recognised schema version", () => {
    expect(asSnapshot(null)).toBeNull();
    expect(asSnapshot("a string")).toBeNull();
    expect(asSnapshot({})).toBeNull();
    // A future shape must not be silently rendered by today's component.
    expect(asSnapshot({ schemaVersion: 2 })).toBeNull();
  });
});
