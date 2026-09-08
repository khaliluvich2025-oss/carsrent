import { cache } from "react";

import { db } from "@/server/db";
import { getTenantDb } from "@/server/tenant";

/**
 * Public-site tenant resolution.
 *
 * The public website has no session, so the agency comes from the URL. This is
 * the one place that is allowed to turn a slug into an agency id — and it
 * immediately hands back a tenant-scoped client, so every query the site makes
 * afterwards is still confined to that agency.
 *
 * `cache()` de-duplicates the lookup across a render pass.
 */
export const getPublicAgency = cache(async (slug: string) => {
  const agency = await db.agency.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      phone: true,
      whatsapp: true,
      email: true,
      address: true,
      city: true,
      googleMapsUrl: true,
      primaryColor: true,
      secondaryColor: true,
      shortDescription: true,
      timezone: true,
      currency: true,
      defaultLocale: true,
      enabledLocales: true,
      logoFile: { select: { publicUrl: true } },
      heroFile: { select: { publicUrl: true } },
    },
  });

  if (!agency?.isActive) return null;

  return { ...agency, db: getTenantDb(agency.id) };
});

export type PublicAgency = NonNullable<
  Awaited<ReturnType<typeof getPublicAgency>>
>;

/** Active pickup/return points offered on the website (spec §22). */
export async function getPublicLocations(agency: PublicAgency) {
  return agency.db.location.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, pickupFee: true, returnFee: true },
  });
}

export async function getPublicSettings(agency: PublicAgency) {
  return agency.db.agencySettings.findFirst({
    select: {
      bufferMinutes: true,
      allowDifferentReturnSite: true,
      securityDepositEnabled: true,
      minRentalHours: true,
      maxAdvanceBookingDays: true,
      minDriverAge: true,
    },
  });
}
