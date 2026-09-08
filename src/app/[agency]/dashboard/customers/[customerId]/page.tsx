import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, ReservationStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, DetailRow, StatTile } from "@/components/ui/card";
import { IconAlert } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { toWhatsAppNumber } from "@/lib/phone";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  getCustomer,
  getCustomerStats,
} from "@/server/services/customers/queries";
import {
  addCustomerNoteAction,
  deleteCustomerNoteAction,
  setCustomerStatusAction,
  updateCustomerAction,
} from "../actions";
import { ContactPanel, NotesPanel, StatusPanel } from "./customer-panels";

export const metadata: Metadata = { title: "Customer" };

const DOC_TONE = {
  VERIFIED: "positive",
  REJECTED: "critical",
  MISSING: "neutral",
} as const;

const DOC_LABELS: Record<string, string> = {
  DRIVING_LICENCE: "Driving licence",
  CIN: "National ID",
  PASSPORT: "Passport",
  OTHER: "Other document",
};

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ agency: string; customerId: string }>;
}) {
  const { agency: slug, customerId } = await params;
  const ctx = await requirePermission("customers.view");

  const customer = await getCustomer(ctx.db, customerId);
  if (!customer) notFound();

  const [agency, stats] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true, currency: true },
    }),
    getCustomerStats(ctx.db, customerId),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";
  const base = `/${slug}/dashboard/customers`;
  const canManage = ctx.can("customers.manage");
  const phoneDigits = toWhatsAppNumber(customer.phone);

  return (
    <>
      <PageHeader
        back={{ href: base, label: "Customers" }}
        title={customer.fullName}
        description={customer.phone}
        meta={
          customer.status === "BLACKLISTED" ? (
            <Badge tone="critical">Blacklisted</Badge>
          ) : customer.status === "WATCHLIST" ? (
            <Badge tone="caution">Watchlist</Badge>
          ) : null
        }
        action={
          canManage ? (
            <ContactPanel
              action={updateCustomerAction.bind(null, slug)}
              customerId={customer.id}
              values={{
                fullName: customer.fullName,
                phone: customer.phone,
                email: customer.email ?? "",
                nationality: customer.nationality ?? "",
              }}
            />
          ) : null
        }
      />

      {customer.status === "BLACKLISTED" ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-card border border-critical/20 bg-critical-soft px-4 py-3 text-sm text-critical">
          <span className="mt-0.5 shrink-0">
            <IconAlert size={18} />
          </span>
          <span>
            This customer is blacklisted. They can still book on the website —
            the flag appears on the reservation so whoever makes the confirmation
            call can decline it.
          </span>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Rentals"
          value={stats.totalReservations}
          hint={`${stats.completed} completed`}
        />
        <StatTile
          label="Total spend"
          value={formatMoney(stats.totalSpend, currency)}
          hint="Received, net of refunds"
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(stats.outstanding, currency)}
          tone={Number(stats.outstanding) > 0 ? "caution" : "neutral"}
        />
        <StatTile
          label="Damage reports"
          value={stats.damageCount}
          tone={stats.damageCount > 0 ? "caution" : "neutral"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Rental history" />
            {customer.reservations.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No rentals yet for this customer.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {customer.reservations.map((reservation) => (
                  <li key={reservation.id}>
                    <Link
                      href={`/${slug}/dashboard/reservations/${reservation.id}`}
                      className="flex items-center gap-3 py-3 transition first:pt-0 last:pb-0 hover:opacity-80"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink">
                            {reservation.bookingReference}
                          </span>
                          <ReservationStatusBadge status={reservation.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm text-ink">
                          {reservation.vehicle.brand} {reservation.vehicle.model}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatInTimezone(
                            reservation.pickupDatetime,
                            timezone,
                            "d MMM yyyy",
                          )}
                          {" → "}
                          {formatInTimezone(
                            reservation.returnDatetime,
                            timezone,
                            "d MMM yyyy",
                          )}
                          {" · "}
                          {reservation.rentalDays}d
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-sm font-semibold text-ink tabular-nums">
                          {formatMoney(
                            reservation.finalTotal,
                            reservation.currency,
                          )}
                        </p>
                        {Number(reservation.amountRemaining) > 0 ? (
                          <p className="text-xs text-caution tabular-nums">
                            {formatMoney(
                              reservation.amountRemaining,
                              reservation.currency,
                            )}{" "}
                            due
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage ? (
            <NotesPanel
              action={addCustomerNoteAction.bind(null, slug)}
              deleteAction={deleteCustomerNoteAction.bind(
                null,
                slug,
                customer.id,
              )}
              customerId={customer.id}
              notes={customer.notes.map((note) => ({
                id: note.id,
                body: note.body,
                author: note.createdBy?.fullName ?? null,
                at: formatInTimezone(note.createdAt, timezone),
              }))}
            />
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <dl>
              <DetailRow label="Phone">
                <a
                  href={`tel:${phoneDigits}`}
                  className="text-[var(--brand)] hover:underline"
                >
                  {customer.phone}
                </a>
              </DetailRow>
              {customer.email ? (
                <DetailRow label="Email">{customer.email}</DetailRow>
              ) : null}
              {customer.nationality ? (
                <DetailRow label="Country">{customer.nationality}</DetailRow>
              ) : null}
              <DetailRow label="First rental">
                {stats.firstBooking
                  ? formatInTimezone(stats.firstBooking, timezone, "d MMM yyyy")
                  : "—"}
              </DetailRow>
              <DetailRow label="Last rental">
                {stats.lastBooking
                  ? formatInTimezone(stats.lastBooking, timezone, "d MMM yyyy")
                  : "—"}
              </DetailRow>
              <DetailRow label="Cancelled / no-show">
                {stats.cancelled}
              </DetailRow>
            </dl>
            <div className="mt-3 flex gap-2">
              <a
                href={`tel:${phoneDigits}`}
                className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium text-ink"
              >
                Call
              </a>
              <a
                href={`https://wa.me/${phoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium text-ink"
              >
                WhatsApp
              </a>
            </div>
          </Card>

          {/* Documents are collected and verified at pickup (spec §11, §36) */}
          <Card>
            <CardHeader
              title="Documents"
              description="Collected and verified at pickup, not at booking."
            />
            {customer.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No documents on file. They are captured during the handover.
              </p>
            ) : (
              <ul className="space-y-2">
                {customer.documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {DOC_LABELS[document.documentType] ??
                          document.documentType}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {document.documentNumber ?? "No number recorded"}
                        {document.expiryDate
                          ? ` · expires ${formatInTimezone(document.expiryDate, timezone, "d MMM yyyy")}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={DOC_TONE[document.verificationStatus]}>
                      {document.verificationStatus.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage ? (
            <StatusPanel
              action={setCustomerStatusAction.bind(null, slug)}
              customerId={customer.id}
              current={customer.status}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
