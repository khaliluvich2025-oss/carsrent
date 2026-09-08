"use server";

import { redirect } from "next/navigation";

import { getSession, destroySession } from "@/server/auth/session";
import { db } from "@/server/db";

export async function logout(): Promise<void> {
  const session = await getSession();
  const slug = session?.agencySlug;

  if (session) {
    await db.auditLog.create({
      data: {
        agencyId: session.agencyId,
        userId: session.userId,
        action: "auth.logout",
        entityType: "User",
        entityId: session.userId,
      },
    });
  }

  await destroySession();
  redirect(slug ? `/${slug}/login` : "/");
}
