"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "./nav-icon";
import { isActivePath, type NavItem } from "./nav-items";

/**
 * Desktop navigation. Client-side only because it needs the current pathname to
 * mark the active item; the item list itself was already filtered by permission
 * on the server.
 */
export function SidebarNav({
  items,
  base,
}: {
  items: NavItem[];
  base: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {items.map((item) => {
        const active = isActivePath(pathname, base, item);
        return (
          <Link
            key={item.key}
            href={`${base}${item.href}`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <span className={active ? "text-[var(--brand)]" : "text-ink-muted"}>
              <NavIcon name={item.icon} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
