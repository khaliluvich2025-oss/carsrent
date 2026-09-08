import Link from "next/link";
import { redirect } from "next/navigation";

import { MobileNav } from "@/components/shell/mobile-nav";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { mobileNavItems, visibleNavItems } from "@/components/shell/nav-items";
import { IconLogout } from "@/components/ui/icons";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { logout } from "./actions";

/**
 * The dashboard shell.
 *
 * Every dashboard route passes through here, so the tenant check happens once.
 * The URL slug is not trusted: if it does not match the signed-in user's own
 * agency they are sent to their own dashboard rather than shown anything under
 * the other agency's URL (spec §97.16).
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const { user, can } = await requireUser();

  if (user.agencySlug !== slug) {
    redirect(`/${user.agencySlug}/dashboard`);
  }

  const agency = await db.agency.findUnique({
    where: { id: user.agencyId },
    select: {
      name: true,
      primaryColor: true,
      logoFile: { select: { publicUrl: true } },
    },
  });

  const base = `/${slug}/dashboard`;
  const items = visibleNavItems(can);
  const { bar, overflow } = mobileNavItems(can);
  const roleLabel = user.role === "OWNER" ? "Owner" : "Employee";
  const agencyName = agency?.name ?? "Agency";

  return (
    <div
      className="min-h-dvh"
      // Per-agency accent, applied once at the shell (spec §76).
      style={
        {
          "--brand": agency?.primaryColor || "#4f46e5",
          "--brand-soft": `color-mix(in srgb, ${agency?.primaryColor || "#4f46e5"} 8%, white)`,
          "--brand-line": `color-mix(in srgb, ${agency?.primaryColor || "#4f46e5"} 22%, white)`,
        } as React.CSSProperties
      }
    >
      {/* Desktop sidebar. Hidden when printing so a contract comes off the
          printer as a document, not a screenshot of the app. */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface md:flex print:!hidden">
        <div className="flex items-center gap-3 px-5 py-5">
          {agency?.logoFile?.publicUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={agency.logoFile.publicUrl}
              alt=""
              className="h-9 w-9 rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-semibold text-[var(--brand-ink)]">
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {agencyName}
            </p>
            <p className="text-xs text-ink-muted">{roleLabel}</p>
          </div>
        </div>

        <SidebarNav items={items} base={base} />

        <div className="border-t border-line p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-ink">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-ink-muted">@{user.username}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-critical-soft hover:text-critical"
            >
              <IconLogout />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden print:!hidden">
        <Link href={base} className="flex min-w-0 items-center gap-2.5">
          {agency?.logoFile?.publicUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={agency.logoFile.publicUrl}
              alt=""
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-semibold text-[var(--brand-ink)]">
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="truncate text-sm font-semibold text-ink">
            {agencyName}
          </span>
        </Link>
      </header>

      <div className="md:pl-64 print:!pl-0">
        {/* Bottom padding clears the mobile tab bar */}
        <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:pt-8 md:pb-10 print:!max-w-none print:!p-0">
          {children}
        </main>
      </div>

      <div className="print:!hidden">
        <MobileNav
          bar={bar}
          overflow={overflow}
          base={base}
          user={{ fullName: user.fullName, role: roleLabel, agencyName }}
          signOut={logout}
        />
      </div>
    </div>
  );
}
