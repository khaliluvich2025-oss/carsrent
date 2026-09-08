import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icons";
import { formatInTimezone } from "@/lib/dates";
import { getTranslator, resolveLocale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toWhatsAppNumber } from "@/lib/phone";
import {
  findBookingForCustomer,
  toCustomerStatus,
  type CustomerStatus,
} from "@/server/services/booking/lookup";
import { flattenParams } from "@/server/services/booking/search-params";
import { getPublicAgency } from "@/server/services/public/agency";

export const metadata: Metadata = { title: "My booking" };

const STATUS_LABEL: Record<CustomerStatus, MessageKey> = {
  PENDING: "status.pending",
  CONFIRMED: "status.confirmed",
  ACTIVE: "status.active",
  COMPLETED: "status.completed",
  CANCELLED: "status.cancelled",
};

const STATUS_TONE: Record<CustomerStatus, Tone> = {
  PENDING: "caution",
  CONFIRMED: "info",
  ACTIVE: "brand",
  COMPLETED: "positive",
  CANCELLED: "neutral",
};

/**
 * My booking (spec §15).
 *
 * Reference + phone, no account (spec §97.18, §97.19). A plain GET form, so the
 * customer can bookmark the result and reopen it from a phone later.
 */
export default async function MyBookingPage({
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

  const reference = flat.reference ?? "";
  const phone = flat.phone ?? "";
  const attempted = Boolean(reference && phone);

  const reservation = attempted
    ? await findBookingForCustomer(agency.db, reference, phone)
    : null;

  const status = reservation ? toCustomerStatus(reservation.status) : null;
  const remaining = reservation ? Number(reservation.amountRemaining) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {t("mine.title")}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">{t("mine.subtitle")}</p>

      <Card className="mt-5">
        <form method="get" className="space-y-4">
          <input type="hidden" name="lang" value={locale} />

          <Field label={t("mine.reference")} htmlFor="reference" required>
            <Input
              id="reference"
              name="reference"
              defaultValue={reference}
              placeholder="RNT-XXXXXX"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono"
              required
            />
          </Field>

          <Field label={t("mine.phone")} htmlFor="phone" required>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={phone}
              placeholder="+212 6…"
              required
            />
          </Field>

          <Button type="submit" size="lg" className="w-full">
            <IconSearch size={18} />
            {t("mine.find")}
          </Button>
        </form>
      </Card>

      {attempted && !reservation ? (
        <p className="mt-4 rounded-lg border border-caution/20 bg-caution-soft px-4 py-3 text-sm text-caution">
          {t("mine.notFound")}
        </p>
      ) : null}

      {reservation && status ? (
        <div className="mt-5 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <span className="font-mono text-sm font-semibold text-ink">
                {reservation.bookingReference}
              </span>
              <Badge tone={STATUS_TONE[status]}>
                {t(STATUS_LABEL[status])}
              </Badge>
            </div>

            <div className="mb-3 flex gap-3">
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
            </dl>
          </Card>

          <Card>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("mine.total")}</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {formatMoney(reservation.finalTotal, reservation.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("mine.paid")}</dt>
                <dd className="text-ink tabular-nums">
                  {formatMoney(reservation.amountPaid, reservation.currency)}
                </dd>
              </div>
              {/* Only shown when there is something to pay (spec §15) */}
              {remaining > 0 ? (
                <div className="flex justify-between gap-4 border-t border-line pt-2">
                  <dt className="font-medium text-ink">
                    {t("mine.remaining")}
                  </dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatMoney(
                      reservation.amountRemaining,
                      reservation.currency,
                    )}
                  </dd>
                </div>
              ) : null}
              {Number(reservation.securityDepositRequired) > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("mine.deposit")}</dt>
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

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">
              {t("mine.contact")}
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              {agency.phone ? (
                <a
                  href={`tel:${agency.phone.replace(/\s/g, "")}`}
                  className="flex h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium text-ink"
                >
                  {t("nav.call")} {agency.phone}
                </a>
              ) : null}
              {agency.whatsapp ? (
                <a
                  href={`https://wa.me/${toWhatsAppNumber(agency.whatsapp)}?text=${encodeURIComponent(reservation.bookingReference)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-ink)]"
                >
                  {t("nav.whatsapp")}
                </a>
              ) : null}
            </div>
          </Card>

          <p className="text-center">
            <Link
              href={`/${slug}/my-booking?lang=${locale}`}
              className="text-sm font-medium text-ink-muted hover:text-ink"
            >
              {t("mine.another")}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
