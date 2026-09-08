import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  IconArrowLeft,
  IconCar,
  IconFuel,
  IconGear,
  IconRoad,
  IconSeat,
  IconShield,
} from "@/components/ui/icons";
import { formatInTimezone } from "@/lib/dates";
import { getTranslator, resolveLocale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { isVehicleAvailable } from "@/server/services/availability/search";
import {
  loadQuoteContext,
  quoteFromContext,
} from "@/server/services/booking/create";
import {
  buildSearchParams,
  flattenParams,
  parseSearch,
} from "@/server/services/booking/search-params";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
} from "@/server/services/fleet/schemas";
import {
  getPublicAgency,
  getPublicSettings,
} from "@/server/services/public/agency";

export const metadata: Metadata = { title: "Car details" };

export default async function CarDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string; vehicleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug, vehicleId }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const agency = await getPublicAgency(slug);
  if (!agency) notFound();

  const flat = flattenParams(rawParams);
  const locale = resolveLocale(flat.lang, agency);
  const t = getTranslator(locale);

  const parsed = parseSearch(flat, agency.timezone);
  if (!parsed.ok) redirect(`/${slug}?lang=${locale}`);

  const { query, pickupAt, returnAt } = parsed.value;

  const vehicle = await agency.db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      brand: true,
      model: true,
      year: true,
      category: true,
      transmission: true,
      fuelType: true,
      seats: true,
      doors: true,
      features: true,
      isActive: true,
      mileagePolicy: true,
      mileageKmPerDay: true,
      extraKmPrice: true,
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        select: { id: true, file: { select: { publicUrl: true } } },
      },
    },
  });

  if (!vehicle?.isActive) notFound();

  const settings = await getPublicSettings(agency);
  const bufferMinutes = settings?.bufferMinutes ?? 0;

  const [available, context] = await Promise.all([
    isVehicleAvailable(agency.db, vehicleId, {
      pickupAt,
      returnAt,
      bufferMinutes,
    }),
    loadQuoteContext(agency.db, {
      vehicleId,
      pickupLocationId: query.pickupLocation,
      returnLocationId: query.returnLocation,
      pickupAt,
    }),
  ]);

  // The same function that prices the reservation, so what the customer is shown
  // and what gets stored cannot drift apart.
  const quote = quoteFromContext(context, { pickupAt, returnAt });

  const searchQs = buildSearchParams(query, { lang: locale });
  const resultsHref = `/${slug}/cars?${searchQs}`;
  const bookHref = `/${slug}/book/${vehicle.id}?${searchQs}`;

  const agencyMileage =
    vehicle.mileagePolicy ?? (settings ? "UNLIMITED" : "UNLIMITED");

  const specs = [
    { icon: <IconGear size={18} />, label: t("car.transmission"), value: TRANSMISSION_LABELS[vehicle.transmission] },
    { icon: <IconFuel size={18} />, label: t("car.fuel"), value: FUEL_LABELS[vehicle.fuelType] },
    { icon: <IconSeat size={18} />, label: t("car.seats"), value: String(vehicle.seats) },
    { icon: <IconCar size={18} />, label: t("car.doors"), value: String(vehicle.doors) },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={resultsHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
      >
        <IconArrowLeft size={16} />
        {t("car.back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* Gallery */}
          <div className="overflow-hidden rounded-card border border-line bg-surface-sunken">
            <div className="aspect-[16/10]">
              {vehicle.images[0]?.file.publicUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={vehicle.images[0].file.publicUrl}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-muted/40">
                  <IconCar size={56} />
                </div>
              )}
            </div>
            {vehicle.images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto p-2">
                {vehicle.images.slice(1).map((image) =>
                  image.file.publicUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={image.id}
                      src={image.file.publicUrl}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-md object-cover"
                    />
                  ) : null,
                )}
              </div>
            ) : null}
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {vehicle.brand} {vehicle.model}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vehicle.year} · {vehicle.category}
            </p>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {t("car.specification")}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {specs.map((spec) => (
                <div key={spec.label} className="flex items-center gap-2.5">
                  <span className="text-ink-muted">{spec.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-muted">
                      {spec.label}
                    </span>
                    <span className="block truncate text-sm font-medium text-ink">
                      {spec.value}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
              <span className="text-ink-muted">
                <IconRoad size={18} />
              </span>
              <span>
                <span className="block text-xs text-ink-muted">
                  {t("car.mileage")}
                </span>
                <span className="block text-sm font-medium text-ink">
                  {agencyMileage === "LIMITED" && vehicle.mileageKmPerDay
                    ? t("car.mileageLimited", {
                        km: vehicle.mileageKmPerDay,
                        price: formatMoney(
                          vehicle.extraKmPrice ?? 0,
                          agency.currency,
                        ),
                      })
                    : t("car.mileageUnlimited")}
                </span>
              </span>
            </div>

            {vehicle.features.length > 0 ? (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="mb-2 text-xs font-medium text-ink-muted">
                  {t("car.features")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {vehicle.features.map((feature) => (
                    <Badge key={feature}>{feature}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Price panel */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {t("car.yourRental")}
            </h2>

            <dl className="space-y-2 border-b border-line pb-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("car.pickup")}</dt>
                <dd className="text-end font-medium text-ink">
                  {formatInTimezone(pickupAt, agency.timezone, "d MMM, HH:mm")}
                  <span className="block text-xs font-normal text-ink-muted">
                    {context.pickupLocation.name}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("car.return")}</dt>
                <dd className="text-end font-medium text-ink">
                  {formatInTimezone(returnAt, agency.timezone, "d MMM, HH:mm")}
                  <span className="block text-xs font-normal text-ink-muted">
                    {context.returnLocation.name}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("car.duration")}</dt>
                <dd className="font-medium text-ink">
                  {quote.duration.billableDays}{" "}
                  {quote.duration.billableDays === 1
                    ? t("car.day")
                    : t("car.days")}
                </dd>
              </div>
            </dl>

            {/* Itemised breakdown (spec §10) */}
            <h3 className="mt-4 mb-2 text-xs font-medium text-ink-muted">
              {t("car.priceBreakdown")}
            </h3>
            <dl className="space-y-1.5 text-sm">
              {quote.lines.map((line, index) => (
                <div key={index} className="flex justify-between gap-4">
                  <dt className="min-w-0 text-ink-soft">
                    {line.label}
                    {line.detail ? (
                      <span className="block text-xs text-ink-muted">
                        {line.detail}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="shrink-0 font-medium text-ink tabular-nums">
                    {formatMoney(line.amount, agency.currency)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm font-semibold text-ink">
                {t("car.total")}
              </span>
              <span className="text-xl font-semibold text-ink tabular-nums">
                {formatMoney(quote.total, agency.currency)}
              </span>
            </div>

            {/* Deposit shown separately and never added in (spec §10, §28) */}
            {Number(quote.securityDeposit) > 0 ? (
              <div className="mt-3 rounded-lg bg-surface-sunken p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-ink-muted">
                    <IconShield size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {t("car.securityDeposit")}
                      </span>
                      <span className="text-sm font-semibold text-ink tabular-nums">
                        {formatMoney(quote.securityDeposit, agency.currency)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t("car.depositNote")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {available ? (
                <ButtonLink href={bookHref} size="lg" className="w-full">
                  {t("car.book")}
                </ButtonLink>
              ) : (
                <>
                  <p className="rounded-lg border border-caution/20 bg-caution-soft px-3 py-2.5 text-center text-sm text-caution">
                    {t("car.unavailable")}
                  </p>
                  <ButtonLink
                    href={resultsHref}
                    variant="secondary"
                    className="mt-2 w-full"
                  >
                    {t("results.changeSearch")}
                  </ButtonLink>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
