import { redirect } from "next/navigation";

import { getTenantDb, type TenantDb } from "@/server/tenant";
import { can, type Permission } from "./permissions";
import { getSession, type SessionUser } from "./session";

/**
 * Every authenticated server entry point starts here.
 *
 * The returned `db` is already bound to the session's agency, so a caller cannot
 * accidentally query another tenant — `agencyId` is never read from the request
 * (spec §86, §97.16).
 */
export type AuthContext = {
  user: SessionUser;
  db: TenantDb;
  can: (permission: Permission) => boolean;
};

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

function contextFor(user: SessionUser): AuthContext {
  return {
    user,
    db: getTenantDb(user.agencyId),
    can: (permission) => can(user.role, permission),
  };
}

/** Non-throwing variant for route handlers that shape their own responses. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getSession();
  return user ? contextFor(user) : null;
}

/** Page/server-action guard: redirects anonymous visitors to the login page. */
export async function requireUser(): Promise<AuthContext> {
  const user = await getSession();
  if (!user) redirect("/login");
  return contextFor(user);
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.can(permission)) throw new ForbiddenError(permission);
  return ctx;
}

/** Shorthand for the many Owner-only surfaces (spec §5, §69, §74). */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== "OWNER") throw new ForbiddenError("settings.manage");
  return ctx;
}
