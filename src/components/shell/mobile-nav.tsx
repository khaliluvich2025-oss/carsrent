"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IconClose, IconLogout, IconMenu } from "@/components/ui/icons";
import { NavIcon } from "./nav-icon";
import { isActivePath, type NavItem } from "./nav-items";

/**
 * Mobile navigation: a fixed bottom bar plus a "More" sheet.
 *
 * Employees do pickups and returns standing at an airport kerb, so the primary
 * targets sit in the thumb zone at the bottom of the screen rather than behind a
 * hamburger at the top (spec §89).
 */
export function MobileNav({
  bar,
  overflow,
  base,
  user,
  signOut,
}: {
  bar: NavItem[];
  overflow: NavItem[];
  base: string;
  user: { fullName: string; role: string; agencyName: string };
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = () => setSheetOpen(false);

  // Don't let the page scroll behind an open sheet.
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {bar.map((item) => {
            const active = isActivePath(pathname, base, item);
            return (
              <li key={item.key}>
                <Link
                  href={`${base}${item.href}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                    active ? "text-[var(--brand)]" : "text-ink-muted"
                  }`}
                >
                  <NavIcon name={item.icon} size={22} />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-expanded={sheetOpen}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-muted"
            >
              <IconMenu size={22} />
              More
            </button>
          </li>
        </ul>
      </nav>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeSheet}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {user.fullName}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {user.role} · {user.agencyName}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="-m-2 rounded-lg p-2 text-ink-muted"
                aria-label="Close menu"
              >
                <IconClose />
              </button>
            </div>

            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {overflow.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`${base}${item.href}`}
                    onClick={closeSheet}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-ink-soft"
                  >
                    <span className="text-ink-muted">
                      <NavIcon name={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-t border-line p-2">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-critical"
                >
                  <IconLogout />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
