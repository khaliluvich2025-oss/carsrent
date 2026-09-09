import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { IconShield } from "@/components/ui/icons";
import { formatInTimezone } from "@/lib/dates";
import { getMessages, getTranslator, resolveLocale } from "@/lib/i18n";
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
  getPublicAgency,
  getPublicSettings,
} from "@/server/services/public/agency";
import { createBookingAction } from "./actions";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Complete your booking" };

export default async function BookPage({
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
  const searchQs = buildSearchParams(query, { lang: locale });

  const vehicle = await agency.db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      brand: true,
      model: true,
      year: true,
      isActive: true,
      images: {
        where: { isCover: true },
        take: 1,
        select: { file: { select: { publicUrl: true } } },
      },
    },
  });
  if (!vehicle?.isActive) notFound();

  const settings = await getPublicSettings(agency);

  const [available, context, extras] = await Promise.all([
    isVehicleAvailable(agency.db, vehicleId, {
      pickupAt,
      returnAt,
      bufferMinutes: settings?.bufferMinutes ?? 0,
    }),
    loadQuoteContext(agency.db, {
      vehicleId,
      pickupLocationId: query.pickupLocation,
      returnLocationId: query.returnLocation,
      pickupAt,
    }),
    agency.db.extra.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        priceType: true,
      },
    }),
  ]);

  // Taken before the customer even opened the form.
  if (!available) {
    redirect(`/${slug}/cars?${searchQs}&taken=1`);
  }

  const quote = quoteFromContext(context, { pickupAt, returnAt });

  // The search string the action needs to re-derive the window server-side.
  const searchForAction: Record<string, string> = {
    ...query,
    lang: locale,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="order-2 lg:order-1">
          <BookingForm
            action={createBookingAction.bind(
              null,
              slug,
              vehicleId,
              searchForAction,
            )}
            messages={getMessages(locale)}
            extras={extras.map((extra) => ({
              id: extra.id,
              name: extra.name,
              description: extra.description,
              price: extra.price.toString(),
              perDay: extra.priceType === "PER_DAY",
            }))}
            alternativesHref={`/${slug}/cars?${searchQs}`}
            currency={agency.currency}
          />
        </div>

        {/* Summary — kept visible above the form on mobile so the price is
            never a surprise at the moment of committing */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {t("book.summary")}
            </h2>

            <div className="mb-3 flex gap-3 border-b border-line pb-3">
              {vehicle.images[0]?.file.publicUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={vehicle.images[0].file.publicUrl}
                  alt=""
                  className="h-14 w-20 shrink-0 rounded-md object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {vehicle.brand} {vehicle.model}
                </p>
                <p className="text-xs text-ink-muted">{vehicle.year}</p>
              </div>
            </div>

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
            </dl>

            <dl className="mt-3 space-y-1.5 text-sm">
              {quote.lines.map((line, index) => (
                <div key={index} className="flex justify-between gap-4">
                  <dt className="min-w-0 text-ink-soft">{line.label}</dt>
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
              <span className="text-lg font-semibold text-ink tabular-nums">
                {formatMoney(quote.total, agency.currency)}
              </span>
            </div>

            {Number(quote.securityDeposit) > 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-surface-sunken p-3 text-xs text-ink-muted">
                <span className="mt-0.5 shrink-0">
                  <IconShield size={16} />
                </span>
                <span>
                  {t("car.securityDeposit")}:{" "}
                  <span className="font-medium text-ink">
                    {formatMoney(quote.securityDeposit, agency.currency)}
                  </span>{" "}
                  — {t("car.depositNote")}
                </span>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-ink-muted">
              {t("home.why1")}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
