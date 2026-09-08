import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import {
  IconCar,
  IconFuel,
  IconGear,
  IconSeat,
} from "@/components/ui/icons";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getTranslator, resolveLocale } from "@/lib/i18n";
import { findAvailableVehicles } from "@/server/services/availability/search";
import {
  buildSearchParams,
  flattenParams,
  parseSearch,
} from "@/server/services/booking/search-params";
import {
  getPublicAgency,
  getPublicSettings,
} from "@/server/services/public/agency";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
} from "@/server/services/fleet/schemas";

export const metadata: Metadata = { title: "Available cars" };

export default async function CarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const agency = await getPublicAgency(slug);
  if (!agency) notFound();

  const flat = flattenParams(rawParams);
  const locale = resolveLocale(flat.lang, agency);
  const t = getTranslator(locale);

  const parsed = parseSearch(flat, agency.timezone);
  if (!parsed.ok) {
    // An incomplete or impossible search belongs back on the form, not on a
    // results page apologising for itself.
    redirect(`/${slug}?lang=${locale}`);
  }

  const { query, filters, pickupAt, returnAt } = parsed.value;

  const [settings, categories] = await Promise.all([
    getPublicSettings(agency),
    agency.db.vehicle.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  // Availability check #1 (spec §20). The final check happens at reservation.
  const vehicles = await findAvailableVehicles(
    agency.db,
    {
      pickupAt,
      returnAt,
      bufferMinutes: settings?.bufferMinutes ?? 0,
    },
    filters,
  );

  const carHref = (vehicleId: string) =>
    `/${slug}/cars/${vehicleId}?${buildSearchParams(query, { lang: locale })}`;

  const searchQs = buildSearchParams(query, { lang: locale });

  const pickupLabel = formatInTimezone(pickupAt, agency.timezone, "d MMM HH:mm");
  const returnLabel = formatInTimezone(returnAt, agency.timezone, "d MMM HH:mm");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* What was searched, with a way back to change it */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken px-4 py-3">
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">
            {pickupLabel} → {returnLabel}
          </span>
        </p>
        <Link
          href={`/${slug}?${searchQs}`}
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          {t("results.changeSearch")}
        </Link>
      </div>

      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {t("results.title")}
        </h1>
        <p className="text-sm text-ink-muted">
          {vehicles.length === 1
            ? t("results.countOne")
            : t("results.count", { count: vehicles.length })}
        </p>
      </div>

      {/* Filters — a GET form that keeps the search in hidden fields (spec §9) */}
      <form
        method="get"
        action={`/${slug}/cars`}
        className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="pickupDate" value={query.pickupDate} />
        <input type="hidden" name="pickupTime" value={query.pickupTime} />
        <input type="hidden" name="returnDate" value={query.returnDate} />
        <input type="hidden" name="returnTime" value={query.returnTime} />
        <input
          type="hidden"
          name="pickupLocation"
          value={query.pickupLocation}
        />
        <input
          type="hidden"
          name="returnLocation"
          value={query.returnLocation}
        />

        <Select
          name="category"
          defaultValue={filters.category ?? ""}
          aria-label={t("results.category")}
        >
          <option value="">{t("results.category")}</option>
          {categories.map((row) => (
            <option key={row.category} value={row.category}>
              {row.category}
            </option>
          ))}
        </Select>

        <Select
          name="transmission"
          defaultValue={filters.transmission ?? ""}
          aria-label={t("results.transmission")}
        >
          <option value="">{t("results.transmission")}</option>
          <option value="MANUAL">{TRANSMISSION_LABELS.MANUAL}</option>
          <option value="AUTOMATIC">{TRANSMISSION_LABELS.AUTOMATIC}</option>
        </Select>

        <Select
          name="fuelType"
          defaultValue={filters.fuelType ?? ""}
          aria-label={t("results.fuel")}
        >
          <option value="">{t("results.fuel")}</option>
          {Object.entries(FUEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          name="minSeats"
          defaultValue={filters.minSeats ? String(filters.minSeats) : ""}
          aria-label={t("results.seats")}
        >
          <option value="">{t("results.seats")}</option>
          {[2, 4, 5, 7, 9].map((seats) => (
            <option key={seats} value={seats}>
              {seats}+
            </option>
          ))}
        </Select>

        <div className="flex gap-2">
          <Input
            name="maxDailyPrice"
            inputMode="decimal"
            defaultValue={filters.maxDailyPrice ?? ""}
            placeholder={t("results.maxPrice")}
            aria-label={t("results.maxPrice")}
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)]"
          >
            {t("results.apply")}
          </button>
        </div>
      </form>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={<IconCar />}
          title={t("results.none")}
          description={t("results.noneHint")}
          action={
            <ButtonLink href={`/${slug}?${searchQs}`} variant="secondary">
              {t("results.changeSearch")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => {
            const cover = vehicle.images[0]?.file.publicUrl;
            return (
              <Link
                key={vehicle.id}
                href={carHref(vehicle.id)}
                className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition hover:border-line-strong hover:shadow-md"
              >
                <div className="aspect-[16/10] overflow-hidden bg-surface-sunken">
                  {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cover}
                      alt={`${vehicle.brand} ${vehicle.model}`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-muted/40">
                      <IconCar size={44} />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h2 className="text-sm font-semibold text-ink">
                    {vehicle.brand} {vehicle.model}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {vehicle.year} · {vehicle.category}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <IconGear size={14} />
                      {TRANSMISSION_LABELS[vehicle.transmission]}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconFuel size={14} />
                      {FUEL_LABELS[vehicle.fuelType]}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconSeat size={14} />
                      {vehicle.seats}
                    </span>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <div>
                      <p className="text-lg font-semibold text-ink">
                        {formatMoney(vehicle.dailyPrice, agency.currency)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {t("results.perDay")}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm text-ink-soft">
                        {formatMoney(vehicle.securityDeposit, agency.currency)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {t("results.deposit")}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
