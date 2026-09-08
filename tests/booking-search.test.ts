import { describe, expect, it } from "vitest";

import { isPlausiblePhone, normalizePhone, toWhatsAppNumber } from "@/lib/phone";
import {
  generateBookingReference,
  normalizeBookingReference,
} from "@/server/services/booking/reference";
import {
  buildSearchParams,
  flattenParams,
  parseSearch,
} from "@/server/services/booking/search-params";

const TZ = "Africa/Casablanca";
const NOW = new Date("2026-09-10T12:00:00Z");

const validSearch = {
  pickupDate: "2026-09-12",
  pickupTime: "10:00",
  returnDate: "2026-09-15",
  returnTime: "10:00",
  pickupLocation: "loc_1",
  returnLocation: "loc_1",
};

describe("search parsing (spec §8, §13)", () => {
  it("parses a complete search into instants", () => {
    const result = parseSearch(validSearch, TZ, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Casablanca is UTC+1 in September
    expect(result.value.pickupAt.toISOString()).toBe("2026-09-12T09:00:00.000Z");
    expect(result.value.returnAt.toISOString()).toBe("2026-09-15T09:00:00.000Z");
  });

  it("rejects an incomplete search", () => {
    const result = parseSearch({ pickupDate: "2026-09-12" }, TZ, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INCOMPLETE");
  });

  it("rejects a return before the pickup", () => {
    const result = parseSearch(
      { ...validSearch, returnDate: "2026-09-11" },
      TZ,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DATES_INVALID");
  });

  it("rejects a zero-length rental", () => {
    const result = parseSearch(
      { ...validSearch, returnDate: "2026-09-12", returnTime: "10:00" },
      TZ,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DATES_INVALID");
  });

  it("rejects a pickup in the past", () => {
    const result = parseSearch(
      { ...validSearch, pickupDate: "2026-09-01" },
      TZ,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DATES_PAST");
  });

  it("tolerates a pickup a few minutes past, so a slow form is not punished", () => {
    // Pickup at 12:50 local (11:50Z), "now" is 12:00Z — 10 minutes past
    const result = parseSearch(
      {
        ...validSearch,
        pickupDate: "2026-09-10",
        pickupTime: "12:50",
        returnDate: "2026-09-12",
      },
      TZ,
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects malformed dates and times", () => {
    expect(parseSearch({ ...validSearch, pickupDate: "12/09/2026" }, TZ, NOW).ok).toBe(false);
    expect(parseSearch({ ...validSearch, pickupTime: "10h" }, TZ, NOW).ok).toBe(false);
  });

  describe("filters", () => {
    it("reads valid filters", () => {
      const result = parseSearch(
        {
          ...validSearch,
          category: "SUV",
          transmission: "AUTOMATIC",
          fuelType: "DIESEL",
          minSeats: "5",
          maxDailyPrice: "500",
        },
        TZ,
        NOW,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.filters).toEqual({
        category: "SUV",
        transmission: "AUTOMATIC",
        fuelType: "DIESEL",
        minSeats: 5,
        maxDailyPrice: "500",
      });
    });

    it("drops filter values that are not real options", () => {
      const result = parseSearch(
        {
          ...validSearch,
          transmission: "TELEPORT",
          fuelType: "PLUTONIUM",
          minSeats: "99",
          maxDailyPrice: "abc",
        },
        TZ,
        NOW,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.filters).toEqual({});
    });
  });

  it("round-trips through the query string", () => {
    const result = parseSearch(validSearch, TZ, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const qs = buildSearchParams(result.value.query, { lang: "FR" });
    const reparsed = parseSearch(
      Object.fromEntries(new URLSearchParams(qs)),
      TZ,
      NOW,
    );

    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.value.pickupAt.toISOString()).toBe(
        result.value.pickupAt.toISOString(),
      );
    }
    expect(qs).toContain("lang=FR");
  });

  it("flattens Next's repeated query params", () => {
    expect(flattenParams({ a: ["one", "two"], b: "three", c: undefined })).toEqual(
      { a: "one", b: "three", c: undefined },
    );
  });
});

describe("booking references (spec §15)", () => {
  it("generates a prefixed reference", () => {
    const reference = generateBookingReference();
    expect(reference).toMatch(/^RNT-[A-Z0-9]{6}$/);
  });

  it("avoids characters that are confused when read aloud", () => {
    // 500 samples is enough to catch a stray character in the alphabet
    for (let index = 0; index < 500; index += 1) {
      expect(generateBookingReference()).not.toMatch(/[IO01258BSZ]/);
    }
  });

  it("does not repeat itself in practice", () => {
    const seen = new Set(
      Array.from({ length: 500 }, () => generateBookingReference()),
    );
    expect(seen.size).toBeGreaterThan(495);
  });

  it("accepts what a customer actually types", () => {
    const canonical = "RNT-ACDEFG";
    for (const typed of [
      "RNT-ACDEFG",
      "rnt-acdefg",
      " RNT ACDEFG ",
      "ACDEFG",
      "acdefg",
      "RNT–ACDEFG",
    ]) {
      expect(normalizeBookingReference(typed)).toBe(canonical);
    }
  });
});

describe("phone normalisation (spec §34)", () => {
  it("collapses formatting so a returning customer is recognised", () => {
    const expected = "+212661234567";
    for (const typed of [
      "+212661234567",
      "+212 661 234 567",
      "+212-661-234-567",
      "00212661234567",
      " +212 (661) 234567 ",
    ]) {
      expect(normalizePhone(typed)).toBe(expected);
    }
  });

  it("keeps a local number local rather than guessing a country", () => {
    expect(normalizePhone("0661234567")).toBe("0661234567");
    expect(normalizePhone("661 234 567")).toBe("661234567");
  });

  it("returns empty for input with no digits", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("not a phone")).toBe("");
  });

  it("accepts plausible lengths and rejects obvious typos", () => {
    expect(isPlausiblePhone("+212661234567")).toBe(true);
    expect(isPlausiblePhone("0661234567")).toBe(true);
    expect(isPlausiblePhone("12345")).toBe(false);
    expect(isPlausiblePhone("1234567890123456789")).toBe(false);
  });

  it("strips everything but digits for a wa.me link", () => {
    expect(toWhatsAppNumber("+212 661-234-567")).toBe("212661234567");
  });
});
