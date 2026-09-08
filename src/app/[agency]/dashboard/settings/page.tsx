import Link from "next/link";
import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import {
  IconChevronRight,
  IconMapPin,
  IconSettings,
  IconUsers,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { BILLING_RULE_LABELS } from "@/server/services/settings/schemas";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requirePermission("settings.manage");

  const [agency, settings, locationCount, seasonCount, extraCount] =
    await Promise.all([
      db.agency.findUnique({
        where: { id: ctx.user.agencyId },
        select: { name: true, currency: true, timezone: true },
      }),
      ctx.db.agencySettings.findFirst({
        select: {
          billingRule: true,
          bufferMinutes: true,
          securityDepositEnabled: true,
          allowDifferentReturnSite: true,
        },
      }),
      ctx.db.location.count({ where: { isActive: true } }),
      ctx.db.seasonalRate.count({ where: { isActive: true } }),
      ctx.db.extra.count({ where: { isActive: true } }),
    ]);

  const base = `/${slug}/dashboard/settings`;

  const teamCount = await ctx.db.user.count({ where: { isActive: true } });

  const sections = [
    {
      href: `${base}/locations`,
      icon: <IconMapPin />,
      title: "Locations & delivery",
      description: `${locationCount} active ${locationCount === 1 ? "location" : "locations"} · different return location ${settings?.allowDifferentReturnSite ? "allowed" : "not allowed"}`,
    },
    {
      href: `${base}/team`,
      icon: <IconUsers />,
      title: "Team",
      description: `${teamCount} active ${teamCount === 1 ? "member" : "members"} · owners and employees`,
    },
    {
      href: `${base}/pricing`,
      icon: <IconSettings />,
      title: "Pricing & billing",
      description: [
        settings
          ? BILLING_RULE_LABELS[settings.billingRule].label
          : "Billing rule",
        `${(settings?.bufferMinutes ?? 0) / 60}h turnaround buffer`,
        `${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`,
        `${extraCount} ${extraCount === 1 ? "extra" : "extras"}`,
      ].join(" · "),
    },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description={`${agency?.name} · ${agency?.currency} · ${agency?.timezone}`}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="group">
            <Card className="h-full transition group-hover:border-line-strong group-hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                  {section.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-ink">
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {section.description}
                  </p>
                </div>
                <span className="mt-2 text-ink-muted transition group-hover:translate-x-0.5">
                  <IconChevronRight size={18} />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-5 text-sm text-ink-muted">
        Agency information, branding, languages, working hours and contract
        policy text are stored and used throughout the product, but their
        editing screens are not built yet — the seeded values apply.
      </p>
    </>
  );
}
