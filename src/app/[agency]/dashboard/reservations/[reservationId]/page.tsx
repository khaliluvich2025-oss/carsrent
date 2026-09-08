import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, ReservationStatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, DetailRow, StatTile } from "@/components/ui/card";
import { IconAlert, IconClock } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { toWhatsAppNumber } from "@/lib/phone";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getReservation } from "@/server/services/reservations/queries";
import {
  canTransition,
  isNoShowEligible,
} from "@/server/services/reservations/transitions";
import {
  cancelReservationAction,
  confirmReservationAction,
  extendReservationAction,
  markNoShowAction,
  markReadyAction,
  modifyReservationAction,
  overridePriceAction,
} from "../actions";
import {
  renderTemplate,
  TEMPLATES,
} from "@/server/services/notifications/templates";
import {
  CancelPanel,
  ExtendPanel,
  ModifyPanel,
  OverridePanel,
} from "./action-panels";
import { MessagePicker } from "./message-picker";

export const metadata: Metadata = { title: "Reservation" };

const CHANGE_LABELS = {
  MODIFICATION: "Modified",
  EXTENSION: "Extended",
  PRICE_OVERRIDE: "Price overridden",
} as const;

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ agency: string; reservationId: string }>;
}) {
  const { agency: slug, reservationId } = await params;
  const ctx = await requirePermission("reservations.view");

  const reservation = await getReservation(ctx.db, reservationId);
  if (!reservation) notFound();

  const [agency, settings, vehicles, locations] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true, currency: true },
    }),
    ctx.db.agencySettings.findFirst({
      select: { noShowWaitingMinutes: true },
    }),
    ctx.db.vehicle.findMany({
      where: { isActive: true },
      select: { id: true, brand: true, model: true, registrationNumber: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
    }),
    ctx.db.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";
  const base = `/${slug}/dashboard/reservations`;
  const canManage = ctx.can("reservations.manage");
  const canCancel = ctx.can("reservations.cancel");
  const canOverride = ctx.can("pricing.override");

  const isoDate = (value: Date) =>
    formatInTimezone(value, timezone, "yyyy-MM-dd");
  const isoTime = (value: Date) => formatInTimezone(value, timezone, "HH:mm");

  const noShowReady = isNoShowEligible(
    reservation.pickupDatetime,
    settings?.noShowWaitingMinutes ?? 120,
  );

  const breakdown = Array.isArray(reservation.pricingBreakdown)
    ? (reservation.pricingBreakdown as {
        label: string;
        detail?: string;
        amount: string;
      }[])
    : [];

  const phoneDigits = toWhatsAppNumber(reservation.customer.phone);
  const waMessage = encodeURIComponent(
    `${reservation.bookingReference} — ${reservation.vehicle.brand} ${reservation.vehicle.model}, ${formatInTimezone(reservation.pickupDatetime, timezone, "d MMM HH:mm")}`,
  );

  const agencyRecord = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { name: true, phone: true },
  });

  const templateVariables = {
    customerName: reservation.customer.fullName.split(" ")[0],
    agencyName: agencyRecord?.name ?? "",
    reference: reservation.bookingReference,
    vehicle: `${reservation.vehicle.brand} ${reservation.vehicle.model}`,
    pickupAt: formatInTimezone(
      reservation.pickupDatetime,
      timezone,
      "EEE d MMM, HH:mm",
    ),
    returnAt: formatInTimezone(
      reservation.returnDatetime,
      timezone,
      "EEE d MMM, HH:mm",
    ),
    pickupLocation: reservation.pickupLocation.name,
    returnLocation: reservation.returnLocation.name,
    total: formatMoney(reservation.finalTotal, currency),
    outstanding: formatMoney(reservation.amountRemaining, currency),
    agencyPhone: agencyRecord?.phone ?? "",
  };

  return (
    <>
      <PageHeader
        back={{ href: base, label: "Reservations" }}
        title={reservation.bookingReference}
        description={`${reservation.customer.fullName} · ${reservation.vehicle.brand} ${reservation.vehicle.model}`}
        meta={
          <>
            <ReservationStatusBadge status={reservation.status} />
            {reservation.manualOverrideAmount ? (
              <Badge tone="info">Price overridden</Badge>
            ) : null}
            {reservation.customer.status === "BLACKLISTED" ? (
              <Badge tone="critical">Blacklisted customer</Badge>
            ) : reservation.customer.status === "WATCHLIST" ? (
              <Badge tone="caution">Watchlist</Badge>
            ) : null}
          </>
        }
      />

      {/* The phone-confirmation step this whole model rests on (spec §12) */}
      {reservation.status === "AWAITING_CONFIRMATION" ? (
        <Card className="mb-5 border-caution/30 bg-caution-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-caution">
                <IconClock size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-caution">
                  Waiting for your confirmation call
                </p>
                <p className="text-xs text-caution/80">
                  The dates are already held. Confirm or cancel to free them.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`tel:${phoneDigits}`}
                className="inline-flex h-9 items-center rounded-lg border border-caution/30 bg-surface px-3 text-sm font-medium text-ink"
              >
                Call {reservation.customer.phone}
              </a>
              <a
                href={`https://wa.me/${phoneDigits}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-caution/30 bg-surface px-3 text-sm font-medium text-ink"
              >
                WhatsApp
              </a>
              {canManage ? (
                <form action={confirmReservationAction.bind(null, slug)}>
                  <input
                    type="hidden"
                    name="reservationId"
                    value={reservation.id}
                  />
                  <Button type="submit" size="sm">
                    Confirm
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Rental total"
          value={formatMoney(reservation.finalTotal, currency)}
          hint={
            reservation.manualOverrideAmount
              ? `was ${formatMoney(reservation.calculatedTotal, currency)}`
              : `${reservation.rentalDays} days`
          }
        />
        <StatTile
          label="Paid"
          value={formatMoney(reservation.amountPaid, currency)}
        />
        <StatTile
          label="Remaining"
          value={formatMoney(reservation.amountRemaining, currency)}
          tone={Number(reservation.amountRemaining) > 0 ? "caution" : "neutral"}
        />
        <StatTile
          label="Deposit"
          value={formatMoney(reservation.securityDepositRequired, currency)}
          hint="Held, not revenue"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Rental" />
            <dl>
              <DetailRow label="Pickup">
                {formatInTimezone(
                  reservation.pickupDatetime,
                  timezone,
                  "EEE d MMM yyyy, HH:mm",
                )}
                <span className="block text-xs font-normal text-ink-muted">
                  {reservation.pickupLocation.name}
                </span>
              </DetailRow>
              <DetailRow label="Return">
                {formatInTimezone(
                  reservation.returnDatetime,
                  timezone,
                  "EEE d MMM yyyy, HH:mm",
                )}
                <span className="block text-xs font-normal text-ink-muted">
                  {reservation.returnLocation.name}
                </span>
              </DetailRow>
              <DetailRow label="Vehicle">
                {reservation.vehicle.brand} {reservation.vehicle.model}{" "}
                {reservation.vehicle.year}
                <span className="block font-mono text-xs font-normal text-ink-muted">
                  {reservation.vehicle.registrationNumber}
                </span>
              </DetailRow>
              <DetailRow label="Booked">
                {formatInTimezone(reservation.createdAt, timezone)}
                <span className="block text-xs font-normal text-ink-muted">
                  {reservation.createdById ? "By staff" : "From the website"}
                </span>
              </DetailRow>
            </dl>

            {reservation.customerNote ? (
              <div className="mt-3 rounded-lg bg-surface-sunken p-3">
                <p className="text-xs font-medium text-ink-muted">
                  Customer note
                </p>
                <p className="mt-0.5 text-sm text-ink">
                  {reservation.customerNote}
                </p>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Price breakdown" />
            {breakdown.length > 0 ? (
              <dl className="space-y-1.5 text-sm">
                {breakdown.map((line, index) => (
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
                      {formatMoney(line.amount, currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-ink-muted">
                No breakdown was stored for this reservation.
              </p>
            )}

            {reservation.manualOverrideAmount ? (
              <div className="mt-3 flex justify-between gap-4 border-t border-line pt-3 text-sm">
                <span className="text-ink-muted">Calculated</span>
                <span className="text-ink-muted line-through tabular-nums">
                  {formatMoney(reservation.calculatedTotal, currency)}
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm font-semibold text-ink">Total</span>
              <span className="text-lg font-semibold text-ink tabular-nums">
                {formatMoney(reservation.finalTotal, currency)}
              </span>
            </div>
          </Card>

          {/* Financial timeline (spec §81) */}
          <Card>
            <CardHeader
              title="Financial history"
              description="Every transaction, kept whole."
            />
            {reservation.payments.length === 0 &&
            reservation.additionalCharges.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nothing has been collected yet. Payments are recorded at pickup.
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {reservation.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {payment.type.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {payment.method.toLowerCase()} ·{" "}
                        {formatInTimezone(payment.createdAt, timezone)}
                        {payment.createdBy
                          ? ` · ${payment.createdBy.fullName}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-medium tabular-nums ${payment.type === "REFUND" ? "text-critical" : "text-positive"}`}
                    >
                      {payment.type === "REFUND" ? "−" : "+"}
                      {formatMoney(payment.amount, currency)}
                    </span>
                  </li>
                ))}
                {reservation.additionalCharges.map((charge) => (
                  <li
                    key={charge.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {charge.type.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {charge.description ?? "Additional charge"}
                        {charge.settleFromDeposit ? " · from deposit" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium text-ink tabular-nums">
                      {formatMoney(charge.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Status history (spec §14) + change history (spec §26, §55, §56) */}
          <Card>
            <CardHeader title="History" />
            <ol className="relative space-y-4 border-s border-line ps-5">
              {reservation.changes.map((change) => (
                <li key={change.id} className="relative">
                  <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-info ring-4 ring-surface" />
                  <p className="text-sm font-medium text-ink">
                    {CHANGE_LABELS[change.changeType]}
                    {change.priceDelta && Number(change.priceDelta) !== 0 ? (
                      <span className="ms-2 text-ink-muted tabular-nums">
                        {Number(change.priceDelta) > 0 ? "+" : ""}
                        {formatMoney(change.priceDelta, currency)}
                      </span>
                    ) : null}
                  </p>
                  {change.reason ? (
                    <p className="text-sm text-ink-muted">{change.reason}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatInTimezone(change.createdAt, timezone)}
                    {change.changedBy ? ` · ${change.changedBy.fullName}` : ""}
                  </p>
                </li>
              ))}
              {reservation.statusHistory.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-line-strong ring-4 ring-surface" />
                  <p className="text-sm font-medium text-ink">
                    {entry.fromStatus
                      ? `${entry.fromStatus.replace(/_/g, " ").toLowerCase()} → `
                      : ""}
                    {entry.toStatus.replace(/_/g, " ").toLowerCase()}
                  </p>
                  {entry.reason ? (
                    <p className="text-sm text-ink-muted">{entry.reason}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatInTimezone(entry.createdAt, timezone)}
                    {entry.changedBy ? ` · ${entry.changedBy.fullName}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <dl>
              <DetailRow label="Name">
                {reservation.customer.fullName}
              </DetailRow>
              <DetailRow label="Phone">
                <a
                  href={`tel:${phoneDigits}`}
                  className="text-[var(--brand)] hover:underline"
                >
                  {reservation.customer.phone}
                </a>
              </DetailRow>
              {reservation.customer.email ? (
                <DetailRow label="Email">
                  {reservation.customer.email}
                </DetailRow>
              ) : null}
              {reservation.customer.nationality ? (
                <DetailRow label="Country">
                  {reservation.customer.nationality}
                </DetailRow>
              ) : null}
            </dl>
            <div className="mt-3 flex gap-2">
              <a
                href={`tel:${phoneDigits}`}
                className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium text-ink"
              >
                Call
              </a>
              <a
                href={`https://wa.me/${phoneDigits}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium text-ink"
              >
                WhatsApp
              </a>
            </div>
          </Card>

          {/* The handover is the main event for a confirmed booking, so it gets
              its own prominent entry rather than sitting among the actions. */}
          {ctx.can("pickup.perform") &&
          (reservation.status === "CONFIRMED" ||
            reservation.status === "READY_FOR_PICKUP") ? (
            <Card>
              <CardHeader
                title="Handover"
                description="Documents, condition, damage, payment and deposit — then the car goes out."
              />
              <ButtonLink
                href={`${base}/${reservation.id}/handover`}
                size="lg"
                className="w-full"
              >
                Start handover
              </ButtonLink>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Message the customer"
              description="Opens WhatsApp with the text ready. Edit it first if you need to."
            />
            <MessagePicker
              phoneDigits={phoneDigits}
              templates={TEMPLATES.map((template) => ({
                key: template.key,
                label: template.label,
                description: template.description,
                body: renderTemplate(template.body, templateVariables),
              }))}
            />
          </Card>

          {ctx.can("returns.perform") &&
          ["ACTIVE", "RETURN_DUE", "OVERDUE", "RETURN_INSPECTION"].includes(
            reservation.status,
          ) ? (
            <Card>
              <CardHeader
                title="Return"
                description="Inspection, charges, deposit settlement — then the car goes back on the market."
              />
              <ButtonLink
                href={`${base}/${reservation.id}/return`}
                size="lg"
                className="w-full"
              >
                Start return
              </ButtonLink>
            </Card>
          ) : null}

          {ctx.can("contracts.generate") ? (
            <Card>
              <CardHeader
                title="Contract"
                description={
                  reservation.contracts.length > 0
                    ? "Generated from this reservation and frozen at that moment."
                    : "Not generated yet."
                }
              />
              <ButtonLink
                href={`${base}/${reservation.id}/contract`}
                variant="secondary"
                className="w-full"
              >
                {reservation.contracts.length > 0
                  ? "View contract"
                  : "Generate contract"}
              </ButtonLink>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader title="Actions" />
              <div className="flex flex-wrap gap-2">
                {canTransition(reservation.status, "READY_FOR_PICKUP") ? (
                  <form action={markReadyAction.bind(null, slug)}>
                    <input
                      type="hidden"
                      name="reservationId"
                      value={reservation.id}
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      Mark ready for pickup
                    </Button>
                  </form>
                ) : null}

                {canTransition(reservation.status, "NO_SHOW") ? (
                  <form action={markNoShowAction.bind(null, slug)}>
                    <input
                      type="hidden"
                      name="reservationId"
                      value={reservation.id}
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={!noShowReady}
                      title={
                        noShowReady
                          ? undefined
                          : "The no-show waiting period has not elapsed yet"
                      }
                    >
                      Mark no-show
                    </Button>
                  </form>
                ) : null}
              </div>

              {canTransition(reservation.status, "NO_SHOW") && !noShowReady ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                  <IconAlert size={14} />
                  No-show becomes available{" "}
                  {settings?.noShowWaitingMinutes
                    ? `${settings.noShowWaitingMinutes / 60}h`
                    : "2h"}{" "}
                  after the pickup time.
                </p>
              ) : null}
            </Card>
          ) : null}

          {canManage ? (
            <div className="space-y-3">
              <ModifyPanel
                action={modifyReservationAction.bind(null, slug)}
                reservationId={reservation.id}
                vehicles={vehicles.map((vehicle) => ({
                  id: vehicle.id,
                  label: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationNumber})`,
                }))}
                locations={locations}
                values={{
                  vehicleId: reservation.vehicleId,
                  pickupLocationId: reservation.pickupLocationId,
                  returnLocationId: reservation.returnLocationId,
                  pickupDate: isoDate(reservation.pickupDatetime),
                  pickupTime: isoTime(reservation.pickupDatetime),
                  returnDate: isoDate(reservation.returnDatetime),
                  returnTime: isoTime(reservation.returnDatetime),
                }}
              />

              <ExtendPanel
                action={extendReservationAction.bind(null, slug)}
                reservationId={reservation.id}
                currentReturn={{
                  date: isoDate(reservation.returnDatetime),
                  time: isoTime(reservation.returnDatetime),
                }}
              />

              {canOverride ? (
                <OverridePanel
                  action={overridePriceAction.bind(null, slug)}
                  reservationId={reservation.id}
                  calculatedTotal={reservation.calculatedTotal.toString()}
                  currentTotal={reservation.finalTotal.toString()}
                  currency={currency}
                />
              ) : null}

              {canCancel && canTransition(reservation.status, "CANCELLED") ? (
                <CancelPanel
                  action={cancelReservationAction.bind(null, slug)}
                  reservationId={reservation.id}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
