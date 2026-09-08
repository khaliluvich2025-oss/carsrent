import type { TenantDb } from "@/server/tenant";

/**
 * Vehicle history timeline (spec §61).
 *
 * Every event a vehicle can accumulate lives in a different table, so the
 * timeline is assembled by querying each source and merging on time. Sources are
 * added here as their phases land — reservations and blocks exist now;
 * maintenance, damage and expenses are queried too and will simply start
 * returning rows once those screens can create them.
 */

export type TimelineKind =
  | "RESERVATION"
  | "MAINTENANCE"
  | "BLOCK"
  | "DAMAGE"
  | "EXPENSE";

export type TimelineEntry = {
  id: string;
  at: Date;
  kind: TimelineKind;
  title: string;
  detail?: string;
};

const BLOCK_LABELS: Record<string, string> = {
  RESERVATION: "Reserved",
  MAINTENANCE: "Maintenance block",
  MANUAL: "Manually blocked",
  PAYMENT_HOLD: "Held during checkout",
};

export async function getVehicleTimeline(
  db: TenantDb,
  vehicleId: string,
  limit = 25,
): Promise<TimelineEntry[]> {
  const [reservations, blocks, maintenance, damage, expenses] =
    await Promise.all([
      db.reservation.findMany({
        where: { vehicleId },
        select: {
          id: true,
          bookingReference: true,
          status: true,
          createdAt: true,
          pickupDatetime: true,
          returnDatetime: true,
          customer: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.vehicleBlock.findMany({
        where: { vehicleId, kind: { in: ["MANUAL", "MAINTENANCE"] } },
        select: {
          id: true,
          kind: true,
          startsAt: true,
          endsAt: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.maintenanceRecord.findMany({
        where: { vehicleId },
        select: {
          id: true,
          category: true,
          description: true,
          performedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.damageRecord.findMany({
        where: { vehicleId },
        select: {
          id: true,
          location: true,
          damageType: true,
          isPreExisting: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.vehicleExpense.findMany({
        where: { vehicleId },
        select: {
          id: true,
          category: true,
          amount: true,
          expenseDate: true,
          notes: true,
        },
        orderBy: { expenseDate: "desc" },
        take: limit,
      }),
    ]);

  const entries: TimelineEntry[] = [
    ...reservations.map((r) => ({
      id: `res-${r.id}`,
      at: r.createdAt,
      kind: "RESERVATION" as const,
      title: `Reservation ${r.bookingReference}`,
      detail: r.customer?.fullName ?? undefined,
    })),
    ...blocks.map((b) => ({
      id: `blk-${b.id}`,
      at: b.createdAt,
      kind: (b.kind === "MAINTENANCE" ? "MAINTENANCE" : "BLOCK") as TimelineKind,
      title: BLOCK_LABELS[b.kind] ?? "Blocked",
      detail: b.reason ?? undefined,
    })),
    ...maintenance.map((m) => ({
      id: `mnt-${m.id}`,
      at: m.performedAt ?? m.createdAt,
      kind: "MAINTENANCE" as const,
      title: m.category.replace(/_/g, " ").toLowerCase(),
      detail: m.description ?? undefined,
    })),
    ...damage.map((d) => ({
      id: `dmg-${d.id}`,
      at: d.createdAt,
      kind: "DAMAGE" as const,
      title: `${d.damageType} — ${d.location}`,
      detail: d.isPreExisting ? "Recorded as pre-existing" : undefined,
    })),
    ...expenses.map((e) => ({
      id: `exp-${e.id}`,
      at: e.expenseDate,
      kind: "EXPENSE" as const,
      title: e.category.replace(/_/g, " ").toLowerCase(),
      detail: e.notes ?? undefined,
    })),
  ];

  return entries
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/**
 * Upcoming commitments for a vehicle — what the fleet screen needs to answer
 * "can I take this car off the road?" (spec §58's conflict warning).
 */
export async function getUpcomingBlocks(db: TenantDb, vehicleId: string) {
  return db.vehicleBlock.findMany({
    where: { vehicleId, endsAt: { gte: new Date() } },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      bufferMinutes: true,
      reason: true,
      reservation: {
        select: {
          bookingReference: true,
          status: true,
          customer: { select: { fullName: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 10,
  });
}
