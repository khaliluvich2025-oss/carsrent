import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClock,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getOperationalAlerts } from "@/server/services/notifications/alerts";
import type { Permission } from "@/server/auth/permissions";

export const metadata: Metadata = { title: "Alerts" };

const TONE_STYLES = {
  critical: "border-critical/20 bg-critical-soft text-critical",
  caution: "border-caution/20 bg-caution-soft text-caution",
  info: "border-line bg-surface text-ink",
} as const;

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requireUser();

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true },
  });

  const alerts = await getOperationalAlerts(
    ctx.db,
    slug,
    agency?.timezone ?? "Africa/Casablanca",
  );

  // An employee's list stays operational; money alerts are Owner-only.
  const visible = alerts.filter((alert) =>
    ctx.can(alert.permission as Permission),
  );

  return (
    <>
      <PageHeader
        title="Alerts"
        description="What needs a person, right now. Nothing here is stored — it is read from the live data every time."
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconCheck />}
          title="Nothing needs attention"
          description="No overdue rentals, no bookings waiting for a call, and nothing due off the road."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((alert) => (
            <li key={alert.id}>
              <Link
                href={alert.href}
                className={`flex items-center gap-3 rounded-card border px-4 py-3.5 transition hover:brightness-[0.99] ${TONE_STYLES[alert.tone]}`}
              >
                <span className="shrink-0">
                  {alert.tone === "critical" ? (
                    <IconAlert size={20} />
                  ) : (
                    <IconClock size={20} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="text-xs opacity-80">{alert.detail}</p>
                </div>
                <span className="shrink-0 opacity-60">
                  <IconChevronRight size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
