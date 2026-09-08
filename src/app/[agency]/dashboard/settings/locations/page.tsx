import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listLocations } from "@/server/services/settings/locations";
import {
  removeLocationAction,
  saveDeliverySettingsAction,
  saveLocationAction,
  type SettingsFormState,
} from "../actions";
import { LocationEditor, type LocationRow } from "./location-editor";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsSettingsPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requirePermission("locations.manage");

  const [agency, settings, locations] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true },
    }),
    ctx.db.agencySettings.findFirst({
      select: { allowDifferentReturnSite: true },
    }),
    listLocations(ctx.db),
  ]);

  const currency = agency?.currency ?? "MAD";

  const rows: LocationRow[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    address: location.address,
    pickupFee: location.pickupFee.toString(),
    returnFee: location.returnFee.toString(),
    isActive: location.isActive,
    usageCount:
      location._count.pickupReservations + location._count.returnReservations,
  }));

  // Bind one update action per location on the server — a factory could not
  // cross into the client component.
  const updateActions: Record<
    string,
    (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  > = {};
  for (const row of rows) {
    updateActions[row.id] = saveLocationAction.bind(null, slug, row.id);
  }

  return (
    <>
      <PageHeader
        title="Locations & delivery"
        description="Where customers can collect and return cars, and what each place costs."
        back={{ href: `/${slug}/dashboard/settings`, label: "Settings" }}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Delivery"
            description="Whether a customer may return the car somewhere other than where they collected it."
          />
          <form
            action={saveDeliverySettingsAction.bind(null, slug)}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="allowDifferentReturnSite"
                defaultChecked={settings?.allowDifferentReturnSite ?? true}
                className="mt-0.5 h-5 w-5 rounded border-line-strong"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">
                  Allow a different return location
                </span>
                <span className="block text-ink-muted">
                  Pickup and return fees are charged separately for each place.
                </span>
              </span>
            </label>
            <Button type="submit" variant="secondary" size="sm">
              Save
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">Locations</h2>
          <LocationEditor
            locations={rows}
            currency={currency}
            createAction={saveLocationAction.bind(null, slug, null)}
            updateActions={updateActions}
            removeAction={removeLocationAction.bind(null, slug)}
          />
          <p className="mt-3 text-xs text-ink-muted">
            A location used by an existing reservation is hidden rather than
            deleted, so past contracts keep pointing at the place the car
            actually changed hands.
          </p>
        </div>
      </div>
    </>
  );
}
