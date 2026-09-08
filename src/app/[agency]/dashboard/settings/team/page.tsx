import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listTeam } from "@/server/services/settings/agency";
import {
  createEmployeeAction,
  resetPasswordAction,
  setEmployeeActiveAction,
} from "./actions";
import { TeamList, type TeamMember } from "./team-panels";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requirePermission("employees.manage");

  const [agency, team] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true },
    }),
    listTeam(ctx.db),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";

  const members: TeamMember[] = team.map((member) => ({
    id: member.id,
    fullName: member.fullName,
    username: member.username,
    role: member.role,
    isActive: member.isActive,
    lastLogin: member.lastLoginAt
      ? formatInTimezone(member.lastLoginAt, timezone, "d MMM yyyy, HH:mm")
      : null,
    activeSessions: member._count.sessions,
    isSelf: member.id === ctx.user.userId,
  }));

  return (
    <>
      <PageHeader
        title="Team"
        description="Only two roles exist: Owner sees everything, Employee runs daily operations."
        back={{ href: `/${slug}/dashboard/settings`, label: "Settings" }}
      />

      <TeamList
        members={members}
        toggleAction={setEmployeeActiveAction.bind(null, slug)}
        resetAction={resetPasswordAction.bind(null, slug)}
        createAction={createEmployeeAction.bind(null, slug)}
      />

      <p className="mt-4 text-xs text-ink-muted">
        Team members are disabled rather than deleted, so everything they did
        stays attributable. Disabling someone ends their sessions immediately.
      </p>
    </>
  );
}
