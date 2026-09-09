import type { Permission } from "@/server/auth/permissions";

/**
 * One definition of the dashboard navigation, filtered by permission.
 *
 * Hiding a link is a convenience, never the control — every route guards itself
 * server-side (spec §97.17). This exists so an Employee is not shown doors they
 * cannot open.
 *
 * `primary: true` marks the items that appear in the mobile bottom bar. Employees
 * and Owners get different bars because their days look different: an Employee
 * lives in today's pickups and returns (spec §64), an Owner also watches the
 * money (spec §63).
 */
export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  /** Show in the mobile bottom bar */
  primary?: boolean;
  /** Match nested routes, e.g. /fleet/abc counts as /fleet */
  exact?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "Overview",
    href: "",
    icon: "gauge",
    permission: "dashboard.view",
    primary: true,
    exact: true,
  },
  {
    key: "reservations",
    label: "Reservations",
    href: "/reservations",
    icon: "clipboard",
    permission: "reservations.view",
    primary: true,
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "calendar",
    permission: "calendar.view",
    primary: true,
  },
  {
    key: "fleet",
    label: "Fleet",
    href: "/fleet",
    icon: "car",
    permission: "fleet.view",
    primary: true,
  },
  {
    key: "customers",
    label: "Customers",
    href: "/customers",
    icon: "users",
    permission: "customers.view",
  },
  {
    key: "alerts",
    label: "Alerts",
    href: "/alerts",
    icon: "alert",
    permission: "dashboard.view",
  },
  // Maintenance has no screen yet (Phase 12). Listed here so it is one line to
  // restore, but kept out of the nav rather than sending staff to a 404.
  // {
  //   key: "maintenance",
  //   label: "Maintenance",
  //   href: "/maintenance",
  //   icon: "wrench",
  //   permission: "maintenance.view",
  // },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    icon: "chart",
    permission: "reports.view",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: "settings",
    permission: "settings.manage",
  },
];

export function visibleNavItems(can: (p: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => can(item.permission));
}

/**
 * The mobile bottom bar holds at most five targets — beyond that they stop being
 * tappable at arm's length. Anything else lives behind "More".
 */
export function mobileNavItems(can: (p: Permission) => boolean): {
  bar: NavItem[];
  overflow: NavItem[];
} {
  const visible = visibleNavItems(can);
  const bar = visible.filter((item) => item.primary).slice(0, 4);
  const barKeys = new Set(bar.map((i) => i.key));
  return { bar, overflow: visible.filter((i) => !barKeys.has(i.key)) };
}

export function isActivePath(
  pathname: string,
  base: string,
  item: NavItem,
): boolean {
  const target = `${base}${item.href}`;
  return item.exact ? pathname === target : pathname.startsWith(target);
}
