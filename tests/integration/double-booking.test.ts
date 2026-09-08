import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { getTenantDb, type TenantDb } from "@/server/tenant";
import {
  createVehicleBlock,
  hasConflictingBlock,
} from "@/server/services/availability/blocks";
import { VehicleUnavailableError } from "@/server/services/availability/errors";

/**
 * spec §92 — the critical double-booking test, against real PostgreSQL.
 *
 * This is the one test that cannot be faked with mocks: the guarantee lives in a
 * GiST exclusion constraint, so only a real database can prove it holds. It runs
 * through the same code path the application uses, tenant-scoped client included.
 *
 * Skipped automatically until DATABASE_URL points at a real database.
 */
const url = process.env.DATABASE_URL ?? "";
const DB_READY = url.length > 0 && !url.includes("user:password@host");

if (!DB_READY) {
  console.warn(
    "[integration] Skipping double-booking tests — set DATABASE_URL in .env and run `npm run db:migrate` first.",
  );
}

// spec §92: Dacia Duster, 12 Sep 10:00 -> 15 Sep 10:00
const PICKUP = new Date("2026-09-12T10:00:00.000Z");
const RETURN = new Date("2026-09-15T10:00:00.000Z");
const BUFFER_MINUTES = 120;

describe.skipIf(!DB_READY)("double-booking protection (spec §92)", () => {
  const slug = `test-concurrency-${Date.now()}`;
  let agencyId: string;
  let vehicleId: string;
  let tdb: TenantDb;

  beforeAll(async () => {
    const agency = await db.agency.create({
      data: { slug, name: "Concurrency Test Agency" },
      select: { id: true },
    });
    agencyId = agency.id;
    tdb = getTenantDb(agencyId);

    const vehicle = await tdb.vehicle.create({
      data: {
        agencyId: tdb.$agencyId,
        brand: "Dacia",
        model: "Duster",
        year: 2026,
        category: "SUV",
        transmission: "AUTOMATIC",
        fuelType: "DIESEL",
        seats: 5,
        registrationNumber: "TEST-CONCURRENCY-1",
        dailyPrice: "450.00",
        securityDeposit: "3000.00",
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
  });

  beforeEach(async () => {
    await tdb.vehicleBlock.deleteMany({ where: { vehicleId } });
  });

  afterAll(async () => {
    if (agencyId) {
      // Cascades through vehicles and blocks.
      await db.agency.delete({ where: { id: agencyId } }).catch(() => {});
    }
    await db.$disconnect();
  });

  const reserve = () =>
    createVehicleBlock(tdb, {
      vehicleId,
      kind: "RESERVATION",
      startsAt: PICKUP,
      endsAt: RETURN,
      bufferMinutes: BUFFER_MINUTES,
    });

  it("accepts the first reservation", async () => {
    const block = await reserve();

    expect(block.vehicleId).toBe(vehicleId);
    expect(block.agencyId).toBe(agencyId);
    expect(block.startsAt.toISOString()).toBe(PICKUP.toISOString());
    // The stored end carries the buffer: 15 Sep 10:00 + 2h
    expect(block.endsAt.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });

  it("rejects a second overlapping reservation", async () => {
    await reserve();
    await expect(reserve()).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  /**
   * THE test. Two customers, same vehicle, same dates, genuinely simultaneous.
   * Exactly one must win; there must never be two overlapping blocks.
   */
  it("lets exactly one of two concurrent bookings succeed", async () => {
    const results = await Promise.allSettled([reserve(), reserve()]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = (rejected[0] as PromiseRejectedResult).reason;
    expect(failure).toBeInstanceOf(VehicleUnavailableError);
    expect((failure as Error).message).toContain("no longer available");

    // And the database holds exactly one block, not two.
    const stored = await tdb.vehicleBlock.count({ where: { vehicleId } });
    expect(stored).toBe(1);
  });

  it("holds under a wider stampede", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => reserve()),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await tdb.vehicleBlock.count({ where: { vehicleId } })).toBe(1);

    for (const result of results.filter((r) => r.status === "rejected")) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(
        VehicleUnavailableError,
      );
    }
  });

  describe("buffer between rentals (spec §21)", () => {
    beforeEach(async () => {
      await reserve();
    });

    it("rejects a pickup inside the turnaround buffer", async () => {
      await expect(
        createVehicleBlock(tdb, {
          vehicleId,
          kind: "RESERVATION",
          startsAt: new Date("2026-09-15T11:00:00.000Z"),
          endsAt: new Date("2026-09-17T10:00:00.000Z"),
          bufferMinutes: BUFFER_MINUTES,
        }),
      ).rejects.toBeInstanceOf(VehicleUnavailableError);
    });

    it("accepts a pickup at exactly return + buffer", async () => {
      const next = await createVehicleBlock(tdb, {
        vehicleId,
        kind: "RESERVATION",
        startsAt: new Date("2026-09-15T12:00:00.000Z"),
        endsAt: new Date("2026-09-17T10:00:00.000Z"),
        bufferMinutes: BUFFER_MINUTES,
      });

      expect(next.id).toBeTruthy();
      expect(await tdb.vehicleBlock.count({ where: { vehicleId } })).toBe(2);
    });
  });

  describe("maintenance and manual blocks share the same table", () => {
    it("blocks a reservation overlapping scheduled maintenance (spec §58)", async () => {
      await createVehicleBlock(tdb, {
        vehicleId,
        kind: "MAINTENANCE",
        startsAt: new Date("2026-09-13T08:00:00.000Z"),
        endsAt: new Date("2026-09-14T18:00:00.000Z"),
        reason: "Oil change",
      });

      await expect(reserve()).rejects.toBeInstanceOf(VehicleUnavailableError);
    });
  });

  describe("expiring payment holds (spec §30)", () => {
    it("does not let an abandoned checkout block the vehicle forever", async () => {
      await createVehicleBlock(tdb, {
        vehicleId,
        kind: "PAYMENT_HOLD",
        startsAt: PICKUP,
        endsAt: RETURN,
        bufferMinutes: BUFFER_MINUTES,
        expiresAt: new Date(Date.now() - 60_000), // already expired
      });

      // The expired hold is swept inside the same transaction as the insert.
      const block = await reserve();
      expect(block.kind).toBe("RESERVATION");
      expect(await tdb.vehicleBlock.count({ where: { vehicleId } })).toBe(1);
    });

    it("still blocks while the hold is live", async () => {
      await createVehicleBlock(tdb, {
        vehicleId,
        kind: "PAYMENT_HOLD",
        startsAt: PICKUP,
        endsAt: RETURN,
        bufferMinutes: BUFFER_MINUTES,
        expiresAt: new Date(Date.now() + 20 * 60_000),
      });

      await expect(reserve()).rejects.toBeInstanceOf(VehicleUnavailableError);
    });
  });

  describe("advisory check agrees with the constraint", () => {
    it("reports no conflict on an empty calendar", async () => {
      expect(
        await hasConflictingBlock(tdb, {
          vehicleId,
          startsAt: PICKUP,
          endsAt: RETURN,
          bufferMinutes: BUFFER_MINUTES,
        }),
      ).toBe(false);
    });

    it("reports a conflict once the window is taken", async () => {
      await reserve();

      expect(
        await hasConflictingBlock(tdb, {
          vehicleId,
          startsAt: PICKUP,
          endsAt: RETURN,
          bufferMinutes: BUFFER_MINUTES,
        }),
      ).toBe(true);
    });

    it("ignores an expired hold", async () => {
      await createVehicleBlock(tdb, {
        vehicleId,
        kind: "PAYMENT_HOLD",
        startsAt: PICKUP,
        endsAt: RETURN,
        expiresAt: new Date(Date.now() - 60_000),
      });

      expect(
        await hasConflictingBlock(tdb, {
          vehicleId,
          startsAt: PICKUP,
          endsAt: RETURN,
          bufferMinutes: BUFFER_MINUTES,
        }),
      ).toBe(false);
    });
  });

  describe("tenant isolation", () => {
    it("does not let another agency see or touch these blocks", async () => {
      await reserve();

      const other = await db.agency.create({
        data: { slug: `${slug}-other`, name: "Other Agency" },
        select: { id: true },
      });

      try {
        const otherDb = getTenantDb(other.id);

        // Same vehicle id, different tenant: invisible.
        expect(
          await otherDb.vehicleBlock.count({ where: { vehicleId } }),
        ).toBe(0);
        expect(await otherDb.vehicle.count()).toBe(0);

        // A delete scoped to the other tenant must not touch our rows.
        await otherDb.vehicleBlock.deleteMany({ where: { vehicleId } });
        expect(await tdb.vehicleBlock.count({ where: { vehicleId } })).toBe(1);
      } finally {
        await db.agency.delete({ where: { id: other.id } }).catch(() => {});
      }
    });
  });
});
