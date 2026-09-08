import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { IconSearch, IconUsers } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  countCustomersByStatus,
  listCustomers,
} from "@/server/services/customers/queries";

export const metadata: Metadata = { title: "Customers" };

const STATUS_CHIPS = [
  { value: "", label: "All" },
  { value: "NORMAL", label: "Normal" },
  { value: "WATCHLIST", label: "Watchlist" },
  { value: "BLACKLISTED", label: "Blacklisted" },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (params: SearchParams, key: string) => {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").toString();
};

export default async function CustomersPage({
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
  const ctx = await requirePermission("customers.view");

  const q = first(rawParams, "q");
  const status = first(rawParams, "status") as
    | "NORMAL"
    | "WATCHLIST"
    | "BLACKLISTED"
    | "";

  const [agency, customers, counts] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true },
    }),
    listCustomers(ctx.db, { q: q || undefined, status }),
    countCustomersByStatus(ctx.db),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const base = `/${slug}/dashboard/customers`;

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${counts.ALL} ${counts.ALL === 1 ? "customer" : "customers"}`}
      />

      <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {STATUS_CHIPS.map((chip) => {
            const active = status === chip.value;
            const count =
              chip.value === "" ? counts.ALL : (counts[chip.value] ?? 0);
            return (
              <Link
                key={chip.value || "all"}
                href={chip.value ? `${base}?status=${chip.value}` : base}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "border-line bg-surface text-ink-soft hover:border-line-strong"
                }`}
              >
                {chip.label}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    active ? "bg-[var(--brand)]/10" : "bg-surface-sunken"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <form method="get" action={base} className="mb-5">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-muted">
            <IconSearch size={18} />
          </span>
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name, phone or email"
            className="ps-10"
            aria-label="Search customers"
          />
        </div>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title={q ? "No customers match" : "No customers yet"}
          description={
            q
              ? "Try a different name or phone number."
              : "A customer record is created automatically the first time someone books."
          }
        />
      ) : (
        <ul className="space-y-2">
          {customers.map((customer) => {
            const last = customer.reservations[0];
            return (
              <li key={customer.id}>
                <Link
                  href={`${base}/${customer.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5 transition hover:border-line-strong hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-ink-soft">
                    {customer.fullName.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {customer.fullName}
                      </p>
                      {customer.status === "BLACKLISTED" ? (
                        <Badge tone="critical">Blacklisted</Badge>
                      ) : customer.status === "WATCHLIST" ? (
                        <Badge tone="caution">Watchlist</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-ink-muted">
                      {customer.phone}
                      {customer.nationality ? ` · ${customer.nationality}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-end">
                    <p className="text-sm font-medium text-ink tabular-nums">
                      {customer._count.reservations}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {last
                        ? formatInTimezone(
                            last.pickupDatetime,
                            timezone,
                            "d MMM yy",
                          )
                        : "no rentals"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
