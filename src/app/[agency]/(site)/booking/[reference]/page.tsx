import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { IconCheck } from "@/components/ui/icons";
import { formatInTimezone } from "@/lib/dates";
import { getTranslator, resolveLocale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toWhatsAppNumber } from "@/lib/phone";
import { normalizeBookingReference } from "@/server/services/booking/reference";
import { flattenParams } from "@/server/services/booking/search-params";
import { getPublicAgency } from "@/server/services/public/agency";

export const metadata: Metadata = { title: "Reservation received" };

/**
 * Confirmation (spec §13).
 *
 * Reachable by reference alone, because the customer has just been redirected
 * here and does not yet have their phone number to hand as a second factor. It
 * therefore shows only what that customer already typed — no other personal
 * data, and no financial history. "My booking" is the guarded view.
 */
export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug, reference }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const agency = await getPublicAgency(slug);
  if (!agency) notFound();

  const locale = resolveLocale(flattenParams(rawParams).lang, agency);
  const t = getTranslator(locale);

  const bookingReference = normalizeBookingReference(reference);

  const reservation = await agency.db.reservation.findFirst({
    where: { bookingReference },
    select: {
      bookingReference: true,
      pickupDatetime: true,
      returnDatetime: true,
      rentalDays: true,
      finalTotal: true,
      securityDepositRequired: true,
      currency: true,
      customer: { select: { fullName: true } },
      vehicle: {
        select: {
          brand: true,
          model: true,
          year: true,
          images: {
            where: { isCover: true },
            take: 1,
            select: { file: { select: { publicUrl: true } } },
          },
        },
      },
      pickupLocation: { select: { name: true } },
      returnLocation: { select: { name: true } },
    },
  });

  if (!reservation) notFound();

  const steps = [t("confirm.next1"), t("confirm.next2"), t("confirm.next3")];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-positive-soft text-positive">
          <IconCheck size={28} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t("confirm.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{t("confirm.subtitle")}</p>
      </div>

      <Card className="mt-6 text-center">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
          {t("confirm.reference")}
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-ink">
          {reservation.bookingReference}
        </p>
        <p className="mt-2 text-xs text-ink-muted">{t("confirm.save")}</p>
      </Card>

      <Card className="mt-4">
        <div className="mb-3 flex gap-3 border-b border-line pb-3">
          {reservation.vehicle.images[0]?.file.publicUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={reservation.vehicle.images[0].file.publicUrl}
              alt=""
              className="h-16 w-24 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {reservation.vehicle.brand} {reservation.vehicle.model}
            </p>
            <p className="text-xs text-ink-muted">
              {reservation.vehicle.year} · {reservation.customer.fullName}
            </p>
          </div>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("car.pickup")}</dt>
            <dd className="text-end font-medium text-ink">
              {formatInTimezone(
                reservation.pickupDatetime,
                agency.timezone,
                "EEE d MMM, HH:mm",
              )}
              <span className="block text-xs font-normal text-ink-muted">
                {reservation.pickupLocation.name}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("car.return")}</dt>
            <dd className="text-end font-medium text-ink">
              {formatInTimezone(
                reservation.returnDatetime,
                agency.timezone,
                "EEE d MMM, HH:mm",
              )}
              <span className="block text-xs font-normal text-ink-muted">
                {reservation.returnLocation.name}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="font-medium text-ink">{t("car.total")}</dt>
            <dd className="font-semibold text-ink tabular-nums">
              {formatMoney(reservation.finalTotal, reservation.currency)}
            </dd>
          </div>
          {Number(reservation.securityDepositRequired) > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("car.securityDeposit")}</dt>
              <dd className="text-ink-soft tabular-nums">
                {formatMoney(
                  reservation.securityDepositRequired,
                  reservation.currency,
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t("confirm.next")}
        </h2>
        <ol className="space-y-2.5">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">
                {index + 1}
              </span>
              <span className="text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/${slug}/my-booking?reference=${reservation.bookingReference}&lang=${locale}`}
          className="flex h-11 flex-1 items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium text-ink"
        >
          {t("confirm.viewBooking")}
        </Link>
        {agency.whatsapp ? (
          <a
            href={`https://wa.me/${toWhatsAppNumber(agency.whatsapp)}?text=${encodeURIComponent(
              `${reservation.bookingReference}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-ink)]"
          >
            {t("nav.whatsapp")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
