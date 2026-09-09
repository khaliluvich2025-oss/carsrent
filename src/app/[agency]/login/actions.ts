"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/server/db";
import { createSession } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { landingPath } from "@/server/auth/redirects";

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

const schema = z.object({
  username: z.string().trim().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

export type LoginState = { error?: string };

/**
 * Username is unique per agency (spec §6), so the agency comes from the URL —
 * never from a form field the caller controls.
 */
export async function login(
  agencySlug: string,
  next: string,
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  const agency = await db.agency.findUnique({
    where: { slug: agencySlug },
    select: { id: true, isActive: true },
  });

  // Deliberately the same message for every failure mode below, so the form
  // never reveals whether an agency or a username exists.
  const GENERIC = { error: "Incorrect username or password." };

  if (!agency?.isActive) return GENERIC;

  const user = await db.user.findUnique({
    where: {
      agencyId_username: {
        agencyId: agency.id,
        username: parsed.data.username,
      },
    },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

  if (!user || !user.isActive) return GENERIC;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);

  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : null,
      },
    });
    return GENERIC;
  }

  const headerList = await headers();
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  await createSession(user.id, {
    ipAddress:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  });

  await db.auditLog.create({
    data: {
      agencyId: agency.id,
      userId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      ipAddress:
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  redirect(landingPath(agencySlug, next));
}
