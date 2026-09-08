import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

import { env, isProduction } from "@/env";
import { db } from "@/server/db";

export const SESSION_COOKIE = "rental_session";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  userId: string;
  agencyId: string;
  agencySlug: string;
  role: Role;
  username: string;
  fullName: string;
  sessionId: string;
};

/**
 * The cookie carries a random token; the database stores only its HMAC. A dump
 * of `sessions` therefore yields nothing usable, and the pepper lives in
 * SESSION_SECRET rather than the database.
 */
function fingerprint(token: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  const session = await db.session.create({
    data: {
      userId,
      tokenHash: fingerprint(token),
      expiresAt: new Date(now + env.SESSION_IDLE_DAYS * DAY_MS),
      absoluteExpiresAt: new Date(now + env.SESSION_ABSOLUTE_DAYS * DAY_MS),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: session.absoluteExpiresAt,
  });
}

/**
 * Resolve the current session. Returns null for anonymous, expired, revoked, or
 * disabled-user requests.
 *
 * Because sessions live in the database, an Owner disabling an employee
 * (spec §6) takes effect on that employee's very next request.
 *
 * `cache()` de-duplicates the lookup within a single render pass.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const record = await db.session.findUnique({
    where: { tokenHash: fingerprint(token) },
    include: {
      user: {
        select: {
          id: true,
          agencyId: true,
          role: true,
          username: true,
          fullName: true,
          isActive: true,
          agency: { select: { slug: true, isActive: true } },
        },
      },
    },
  });

  if (!record) return null;

  const now = new Date();
  if (record.expiresAt <= now || record.absoluteExpiresAt <= now) {
    await db.session.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }

  if (!record.user.isActive || !record.user.agency.isActive) {
    await db.session.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }

  // Sliding expiry, capped by absoluteExpiresAt. Only written once an hour has
  // passed so a burst of requests does not become a burst of writes.
  const nextExpiry = new Date(
    Math.min(
      now.getTime() + env.SESSION_IDLE_DAYS * DAY_MS,
      record.absoluteExpiresAt.getTime(),
    ),
  );
  if (now.getTime() - record.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.session
      .update({
        where: { id: record.id },
        data: { expiresAt: nextExpiry, lastSeenAt: now },
      })
      .catch(() => {});
  }

  return {
    userId: record.user.id,
    agencyId: record.user.agencyId,
    agencySlug: record.user.agency.slug,
    role: record.user.role,
    username: record.user.username,
    fullName: record.user.fullName,
    sessionId: record.id,
  };
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: fingerprint(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user — used on disable and on password reset. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/** Constant-time comparison for any token check outside the session path. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
