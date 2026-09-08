import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  listExtras,
  listSeasonalRates,
} from "@/server/services/settings/pricing";
import {
  createExtraAction,
  createSeasonalRateAction,
  deleteExtraAction,
  deleteSeasonalRateAction,
  saveBillingSettingsAction,
  toggleExtraAction,
  toggleSeasonalRateAction,
} from "../actions";
import { BillingForm, type BillingValues } from "./billing-form";
import { ExtraEditor, type ExtraRow } from "./extra-editor";
import {
  SeasonEditor,
  type SeasonRow,
  type VehicleOption,
} from "./season-editor";

export const metadata: Metadata = { title: "Pricing" };

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

export default async function PricingSettingsPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requirePermission("pricing.manage");

  const [agency, settings, seasons, extras, vehicles] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true },
    }),
    ctx.db.agencySettings.findFirst({
      select: {
        billingRule: true,
        gracePeriodMinutes: true,
        extraHourPrice: true,
        bufferMinutes: true,
        noShowWaitingMinutes: true,
        securityDepositEnabled: true,
      },
    }),
    listSeasonalRates(ctx.db),
    listExtras(ctx.db),
    ctx.db.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        brand: true,
        model: true,
        registrationNumber: true,
      },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
    }),
  ]);

  const currency = agency?.currency ?? "MAD";

  const billingValues: BillingValues = {
    billingRule: settings?.billingRule ?? "GRACE_PERIOD",
    gracePeriodMinutes: String(settings?.gracePeriodMinutes ?? 60),
    extraHourPrice: settings?.extraHourPrice.toString() ?? "0",
    bufferMinutes: String(settings?.bufferMinutes ?? 120),
    noShowWaitingMinutes: String(settings?.noShowWaitingMinutes ?? 120),
    securityDepositEnabled: settings?.securityDepositEnabled ?? true,
  };

  const seasonRows: SeasonRow[] = seasons.map((season) => ({
    id: season.id,
    name: season.name,
    startDate: isoDate(season.startDate),
    endDate: isoDate(season.endDate),
    dailyPrice: season.dailyPrice.toString(),
    priority: season.priority,
    isActive: season.isActive,
    vehicleLabel: season.vehicle
      ? `${season.vehicle.brand} ${season.vehicle.model} (${season.vehicle.registrationNumber})`
      : null,
  }));

  const extraRows: ExtraRow[] = extras.map((extra) => ({
    id: extra.id,
    name: extra.name,
    description: extra.description,
    priceType: extra.priceType,
    price: extra.price.toString(),
    isActive: extra.isActive,
  }));

  const vehicleOptions: VehicleOption[] = vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationNumber})`,
  }));

  return (
    <>
      <PageHeader
        title="Pricing & billing"
        description="How rentals are priced and how overruns are charged. Per-vehicle rates live on each vehicle."
        back={{ href: `/${slug}/dashboard/settings`, label: "Settings" }}
      />

      <div className="space-y-8">
        <BillingForm
          action={saveBillingSettingsAction.bind(null, slug)}
          values={billingValues}
          currency={currency}
        />

        <section>
          <h2 className="mb-1 text-sm font-semibold text-ink">
            Seasonal rates
          </h2>
          <p className="mb-3 text-sm text-ink-muted">
            A season replaces the vehicle&rsquo;s daily rate for rentals that
            start inside it — including long ones, so peak pricing is not
            undercut by the weekly or monthly tier.
          </p>
          <SeasonEditor
            seasons={seasonRows}
            vehicles={vehicleOptions}
            currency={currency}
            createAction={createSeasonalRateAction.bind(null, slug)}
            deleteAction={deleteSeasonalRateAction.bind(null, slug)}
            toggleAction={toggleSeasonalRateAction.bind(null, slug)}
          />
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold text-ink">Extras</h2>
          <p className="mb-3 text-sm text-ink-muted">
            Optional add-ons offered during booking. The price is copied onto the
            reservation, so changing it here never rewrites an existing booking.
          </p>
          <ExtraEditor
            extras={extraRows}
            currency={currency}
            createAction={createExtraAction.bind(null, slug)}
            deleteAction={deleteExtraAction.bind(null, slug)}
            toggleAction={toggleExtraAction.bind(null, slug)}
          />
        </section>
      </div>
    </>
  );
}
