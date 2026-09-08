import Link from "next/link";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { IconCar, IconPlus, IconSearch } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { VEHICLE_STATUS_LABELS } from "@/components/ui/badge";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  FUEL_LABELS,
  FUEL_TYPES,
  fleetFilterSchema,
  TRANSMISSION_LABELS,
  TRANSMISSIONS,
  VEHICLE_STATUSES,
} from "@/server/services/fleet/schemas";
import {
  countVehiclesByStatus,
  listCategories,
  listVehicles,
} from "@/server/services/fleet/vehicles";
import { VehicleCard } from "./vehicle-card";

export const metadata: Metadata = { title: "Fleet" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Build a href that changes one filter and keeps the rest. */
function withParam(
  base: string,
  params: SearchParams,
  key: string,
  value: string,
): string {
  const search = new URLSearchParams();
  for (const name of ["q", "status", "category", "transmission", "fuelType", "archived"]) {
    const current = name === key ? value : first(params, name);
    if (current) search.set(name, current);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export default async function FleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const ctx = await requirePermission("fleet.view");

  const parsed = fleetFilterSchema.safeParse({
    q: first(rawParams, "q") || undefined,
    status: first(rawParams, "status"),
    category: first(rawParams, "category"),
    transmission: first(rawParams, "transmission"),
    fuelType: first(rawParams, "fuelType"),
    archived: first(rawParams, "archived"),
  });
  const filters = parsed.success ? parsed.data : {};

  const [agency, vehicles, counts, categories] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true },
    }),
    listVehicles(ctx.db, filters),
    countVehiclesByStatus(ctx.db),
    listCategories(ctx.db),
  ]);

  const currency = agency?.currency ?? "MAD";
  const base = `/${slug}/dashboard/fleet`;
  const canManage = ctx.can("fleet.manage");
  const showingArchived = filters.archived === "1";
  const hasFilters = Boolean(
    filters.q ||
      filters.status ||
      filters.category ||
      filters.transmission ||
      filters.fuelType,
  );

  const chips = [
    { value: "", label: "All", count: counts.total },
    ...VEHICLE_STATUSES.map((status) => ({
      value: status,
      label: VEHICLE_STATUS_LABELS[status].label,
      count: counts.byStatus[status],
    })),
  ];

  return (
    <>
      <PageHeader
        title="Fleet"
        description={`${counts.total} active ${counts.total === 1 ? "vehicle" : "vehicles"}`}
        action={
          canManage ? (
            <ButtonLink href={`${base}/new`} className="w-full sm:w-auto">
              <IconPlus size={18} />
              Add vehicle
            </ButtonLink>
          ) : null
        }
      />

      {/* Status chips */}
      <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {chips.map((chip) => {
            const active = (filters.status ?? "") === chip.value && !showingArchived;
            return (
              <Link
                key={chip.value || "all"}
                href={withParam(base, { ...rawParams, archived: "" }, "status", chip.value)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "border-line bg-surface text-ink-soft hover:border-line-strong"
                }`}
              >
                {chip.label}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-[var(--brand)]/10" : "bg-surface-sunken"}`}
                >
                  {chip.count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search + filters. A plain GET form, so it works before JS loads. */}
      <form
        method="get"
        action={base}
        className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        {filters.status ? (
          <input type="hidden" name="status" value={filters.status} />
        ) : null}
        {showingArchived ? (
          <input type="hidden" name="archived" value="1" />
        ) : null}

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <IconSearch size={18} />
          </span>
          <Input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search brand, model or registration"
            className="pl-10"
            aria-label="Search vehicles"
          />
        </div>

        <Select
          name="category"
          defaultValue={filters.category ?? ""}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select
          name="transmission"
          defaultValue={filters.transmission ?? ""}
          aria-label="Transmission"
        >
          <option value="">Any transmission</option>
          {TRANSMISSIONS.map((t) => (
            <option key={t} value={t}>
              {TRANSMISSION_LABELS[t]}
            </option>
          ))}
        </Select>

        <Select
          name="fuelType"
          defaultValue={filters.fuelType ?? ""}
          aria-label="Fuel"
        >
          <option value="">Any fuel</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_LABELS[f]}
            </option>
          ))}
        </Select>

        <button type="submit" className="sr-only">
          Apply filters
        </button>
      </form>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={<IconCar />}
          title={
            hasFilters
              ? "No vehicles match these filters"
              : showingArchived
                ? "No archived vehicles"
                : "No vehicles yet"
          }
          description={
            hasFilters
              ? "Try clearing the search or choosing a different category."
              : showingArchived
                ? "Vehicles you archive will appear here and stay linked to their rental history."
                : "Add your first car to start taking reservations. You can set its pricing, deposit and photos now and adjust them any time."
          }
          action={
            hasFilters ? (
              <ButtonLink href={base} variant="secondary">
                Clear filters
              </ButtonLink>
            ) : canManage && !showingArchived ? (
              <ButtonLink href={`${base}/new`}>
                <IconPlus size={18} />
                Add vehicle
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              href={`${base}/${vehicle.id}`}
              currency={currency}
            />
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href={withParam(base, rawParams, "archived", showingArchived ? "" : "1")}
          className="text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          {showingArchived ? "Back to active fleet" : "View archived vehicles"}
        </Link>
      </div>
    </>
  );
}
