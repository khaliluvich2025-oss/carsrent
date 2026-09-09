import { z } from "zod";

import { isPlausiblePhone, normalizePhone } from "@/lib/phone";
import { optionalText, requiredText } from "@/lib/validation";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import type { TenantDb } from "@/server/tenant";

/**
 * Agency identity, branding, hours, policies and team (spec §74–§79).
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export class SettingsError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "SettingsError";
  }
}

/**
 * Identity and contact details (spec §75).
 *
 * Deliberately separate from branding and localisation below: each settings
 * screen saves only the fields it shows, so a form can never blank out a value
 * it did not display.
 */
export const agencyProfileSchema = z.object({
  name: requiredText("Agency name is required", 120),
  phone: optionalText,
  whatsapp: optionalText,
  email: optionalText,
  address: optionalText,
  city: optionalText,
  googleMapsUrl: optionalText,
  shortDescription: optionalText,
});

export type AgencyProfileInput = z.infer<typeof agencyProfileSchema>;

export async function updateAgencyProfile(
  agencyId: string,
  input: AgencyProfileInput,
) {
  if (input.phone && !isPlausiblePhone(input.phone)) {
    throw new SettingsError("phone", "Enter a valid phone number.");
  }
  if (input.whatsapp && !isPlausiblePhone(input.whatsapp)) {
    throw new SettingsError("whatsapp", "Enter a valid WhatsApp number.");
  }

  return db.agency.update({
    where: { id: agencyId },
    data: {
      name: input.name,
      phone: input.phone ? normalizePhone(input.phone) : null,
      whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
      email: input.email,
      address: input.address,
      city: input.city,
      googleMapsUrl: input.googleMapsUrl,
      shortDescription: input.shortDescription,
    },
    select: { id: true },
  });
}

/** Branding (spec §76). Colours drive both the dashboard and the website. */
export const brandingSchema = z.object({
  primaryColor: z.string().trim().regex(HEX, "Use a colour like #c2410c"),
  secondaryColor: z.string().trim().regex(HEX, "Use a colour like #0f172a"),
});

export type BrandingInput = z.infer<typeof brandingSchema>;

export async function updateBranding(agencyId: string, input: BrandingInput) {
  return db.agency.update({
    where: { id: agencyId },
    data: {
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
    },
    select: { id: true },
  });
}

/** Languages, currency and timezone (spec §8, §74, §93, §94). */
export const localisationSchema = z.object({
  timezone: requiredText("Timezone is required", 60),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter code like MAD"),
  defaultLocale: z.enum(["EN", "FR", "AR"]),
  enabledLocales: z
    .array(z.enum(["EN", "FR", "AR"]))
    .min(1, "Enable at least one language"),
});

export type LocalisationInput = z.infer<typeof localisationSchema>;

export async function updateLocalisation(
  agencyId: string,
  input: LocalisationInput,
) {
  // The default language must be one the agency actually offers, or the public
  // site would try to render a language its own switcher does not show.
  const enabled = input.enabledLocales.includes(input.defaultLocale)
    ? input.enabledLocales
    : [...input.enabledLocales, input.defaultLocale];

  return db.agency.update({
    where: { id: agencyId },
    data: {
      timezone: input.timezone,
      currency: input.currency,
      defaultLocale: input.defaultLocale,
      enabledLocales: enabled,
    },
    select: { id: true },
  });
}

/** Working hours, one row per weekday (spec §77). */
export const workingHoursSchema = z.object({
  days: z.array(
    z.object({
      dayOfWeek: z.coerce.number().int().min(0).max(6),
      isClosed: z.boolean(),
      opensAt: z.string().regex(/^\d{2}:\d{2}$/),
      closesAt: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
});

export async function updateWorkingHours(
  db: TenantDb,
  agencyId: string,
  days: z.infer<typeof workingHoursSchema>["days"],
) {
  for (const day of days) {
    await db.workingHours.upsert({
      where: { agencyId_dayOfWeek: { agencyId, dayOfWeek: day.dayOfWeek } },
      create: {
        agencyId,
        dayOfWeek: day.dayOfWeek,
        isClosed: day.isClosed,
        opensAt: day.opensAt,
        closesAt: day.closesAt,
      },
      update: {
        isClosed: day.isClosed,
        opensAt: day.opensAt,
        closesAt: day.closesAt,
      },
    });
  }
}

/** Rental conditions and contract text (spec §51, §78). */
export const conditionsSchema = z.object({
  minDriverAge: z.coerce.number().int().min(16).max(99),
  minLicenceYears: z.coerce.number().int().min(0).max(50),
  mileagePolicy: z.enum(["UNLIMITED", "LIMITED"]),
  mileageKmPerDay: z.coerce.number().int().min(0).max(10_000).optional(),
  fuelPolicy: z.enum(["FULL_TO_FULL", "SAME_AS_PICKUP", "PREPAID"]),

  legalName: optionalText,
  registrationNumber: optionalText,
  taxId: optionalText,
  termsAndConditions: optionalText,
  fuelPolicyText: optionalText,
  mileagePolicyText: optionalText,
  damagePolicyText: optionalText,
  cancellationText: optionalText,
  depositPolicyText: optionalText,
  footerText: optionalText,
});

export type ConditionsInput = z.infer<typeof conditionsSchema>;

export async function updateConditions(
  tdb: TenantDb,
  agencyId: string,
  input: ConditionsInput,
) {
  await tdb.agencySettings.updateMany({
    data: {
      minDriverAge: input.minDriverAge,
      minLicenceYears: input.minLicenceYears,
      mileagePolicy: input.mileagePolicy,
      mileageKmPerDay: input.mileageKmPerDay ?? null,
      fuelPolicy: input.fuelPolicy,
    },
  });

  await tdb.contractSettings.updateMany({
    data: {
      legalName: input.legalName,
      registrationNumber: input.registrationNumber,
      taxId: input.taxId,
      termsAndConditions: input.termsAndConditions,
      fuelPolicyText: input.fuelPolicyText,
      mileagePolicyText: input.mileagePolicyText,
      damagePolicyText: input.damagePolicyText,
      cancellationText: input.cancellationText,
      depositPolicyText: input.depositPolicyText,
      footerText: input.footerText,
    },
  });

  void agencyId;
}

// ---------------------------------------------------------------------------
// Team (spec §6, §79)
// ---------------------------------------------------------------------------

export const employeeSchema = z.object({
  fullName: requiredText("Name is required", 120),
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only")
    .transform((value) => value.toLowerCase()),
  role: z.enum(["OWNER", "EMPLOYEE"]),
  phone: optionalText,
  email: optionalText,
  password: z.string().min(1, "A password is required"),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

export class TeamError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamError";
  }
}

export async function listTeam(tdb: TenantDb) {
  return tdb.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      isActive: true,
      phone: true,
      email: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });
}

export async function createEmployee(
  tdb: TenantDb,
  agencyId: string,
  input: EmployeeInput,
) {
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new TeamError("password", weak);

  if (input.phone && !isPlausiblePhone(input.phone)) {
    throw new TeamError("phone", "Enter a valid phone number.");
  }

  const clash = await tdb.user.findFirst({
    where: { username: input.username },
    select: { id: true },
  });
  if (clash) {
    throw new TeamError("username", "That username is already taken.");
  }

  return tdb.user.create({
    data: {
      agencyId,
      fullName: input.fullName,
      username: input.username,
      role: input.role,
      phone: input.phone ? normalizePhone(input.phone) : null,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });
}

/**
 * Disable rather than delete (spec §6), and end their sessions immediately —
 * a disabled employee who keeps working until their cookie expires is not
 * disabled.
 */
export async function setEmployeeActive(
  tdb: TenantDb,
  userId: string,
  isActive: boolean,
) {
  const updated = await tdb.user.update({
    where: { id: userId },
    data: { isActive },
    select: { id: true },
  });

  if (!isActive) await revokeAllSessions(userId);
  return updated;
}

export async function resetEmployeePassword(
  tdb: TenantDb,
  userId: string,
  password: string,
) {
  const weak = validatePasswordStrength(password);
  if (weak) throw new TeamError("password", weak);

  await tdb.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Everywhere they were signed in is now stale.
  await revokeAllSessions(userId);
}

/** Recent activity for one employee (spec §79). */
export async function getEmployeeActivity(tdb: TenantDb, userId: string) {
  return tdb.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      reason: true,
      createdAt: true,
    },
  });
}
