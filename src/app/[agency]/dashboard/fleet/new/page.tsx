import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { createVehicleAction } from "../actions";
import { EMPTY_VEHICLE, VehicleForm } from "../vehicle-form";

export const metadata: Metadata = { title: "Add vehicle" };

export default async function NewVehiclePage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requirePermission("fleet.manage");

  const [agency, settings] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true },
    }),
    ctx.db.agencySettings.findFirst({
      select: { securityDepositEnabled: true },
    }),
  ]);

  const base = `/${slug}/dashboard/fleet`;

  return (
    <>
      <PageHeader
        title="Add vehicle"
        description={
          settings?.securityDepositEnabled === false
            ? "Security deposits are currently switched off for this agency, so the deposit is stored but not collected."
            : "Pricing and deposit can be changed later without affecting existing reservations."
        }
        back={{ href: base, label: "Fleet" }}
      />

      <VehicleForm
        action={createVehicleAction.bind(null, slug)}
        values={EMPTY_VEHICLE}
        currency={agency?.currency ?? "MAD"}
        cancelHref={base}
        submitLabel="Add vehicle"
      />
    </>
  );
}
