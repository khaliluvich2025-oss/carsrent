"use server";

import { revalidatePath } from "next/cache";

import { fieldErrors } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  agencyProfileSchema,
  brandingSchema,
  conditionsSchema,
  localisationSchema,
  SettingsError,
  updateAgencyProfile,
  updateBranding,
  updateConditions,
  updateLocalisation,
  updateWorkingHours,
} from "@/server/services/settings/agency";
import {
  buildKey,
  IMAGE_TYPES,
  isStorageConfigured,
  MAX_IMAGE_BYTES,
  uploadObject,
} from "@/server/storage";

export type SettingsState = {
  errors?: Record<string, string>;
  message?: string;
  saved?: boolean;
  /**
   * The URL of a just-uploaded image. The form swaps its preview to this the
   * moment the upload lands, rather than waiting for the revalidated page.
   */
  imageUrl?: string;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

/**
 * Branding and localisation change how every page renders, so the whole
 * dashboard and the public site are revalidated rather than just this screen.
 */
function revalidateAll(slug: string) {
  revalidatePath(`/${slug}`, "layout");
}

async function audit(
  ctx: Awaited<ReturnType<typeof requirePermission>>,
  action: string,
  newValue: unknown,
) {
  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action,
      entityType: "Agency",
      entityId: ctx.user.agencyId,
      newValue: JSON.parse(JSON.stringify(newValue)),
    },
  });
}

export async function saveProfileAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requirePermission("settings.manage");

  const parsed = agencyProfileSchema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    whatsapp: text(formData, "whatsapp"),
    email: text(formData, "email"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    googleMapsUrl: text(formData, "googleMapsUrl"),
    shortDescription: text(formData, "shortDescription"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await updateAgencyProfile(ctx.user.agencyId, parsed.data);
  } catch (error) {
    if (error instanceof SettingsError) {
      return { errors: { [error.field]: error.message } };
    }
    throw error;
  }

  await audit(ctx, "settings.profile_update", { name: parsed.data.name });
  revalidateAll(slug);
  return { saved: true };
}

export async function saveBrandingAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requirePermission("branding.manage");

  const parsed = brandingSchema.safeParse({
    primaryColor: text(formData, "primaryColor"),
    secondaryColor: text(formData, "secondaryColor"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await updateBranding(ctx.user.agencyId, parsed.data);
  await audit(ctx, "settings.branding_update", parsed.data);
  revalidateAll(slug);
  return { saved: true };
}

/**
 * Logo and hero upload (spec §76, §85).
 *
 * Both are PUBLIC objects: anonymous visitors have to render them on the client
 * website, so they cannot sit behind an authorised route.
 */
export async function uploadBrandImageAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requirePermission("branding.manage");

  if (!isStorageConfigured()) {
    return { message: "Object storage is not configured." };
  }

  const kind = text(formData, "kind");
  if (kind !== "logo" && kind !== "hero") {
    return { message: "Unknown image." };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Choose an image first." };
  }
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
    return { message: "Use a JPEG, PNG, WebP or AVIF image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { message: "That image is larger than 8 MB." };
  }

  const uploaded = await uploadObject({
    key: buildKey({
      agencyId: ctx.db.$agencyId,
      entity: "branding",
      entityId: kind,
      filename: file.name,
    }),
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
    visibility: "PUBLIC",
  });

  const stored = await ctx.db.storedFile.create({
    data: {
      agencyId: ctx.db.$agencyId,
      bucket: uploaded.bucket,
      key: uploaded.key,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      visibility: "PUBLIC",
      publicUrl: uploaded.publicUrl,
      originalName: file.name,
      uploadedById: ctx.user.userId,
    },
    select: { id: true },
  });

  await db.agency.update({
    where: { id: ctx.user.agencyId },
    data: kind === "logo" ? { logoFileId: stored.id } : { heroFileId: stored.id },
  });

  await audit(ctx, "settings.branding_image", { kind });
  revalidateAll(slug);
  return { saved: true, imageUrl: uploaded.publicUrl ?? undefined };
}

export async function saveLocalisationAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requirePermission("settings.manage");

  const parsed = localisationSchema.safeParse({
    timezone: text(formData, "timezone"),
    currency: text(formData, "currency"),
    defaultLocale: text(formData, "defaultLocale"),
    enabledLocales: formData.getAll("enabledLocales").map(String),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await updateLocalisation(ctx.user.agencyId, parsed.data);
  await audit(ctx, "settings.localisation_update", parsed.data);
  revalidateAll(slug);
  return { saved: true };
}

export async function saveOperationsAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requirePermission("settings.manage");

  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isClosed: formData.get(`closed-${dayOfWeek}`) === "on",
    opensAt: text(formData, `opens-${dayOfWeek}`) || "08:00",
    closesAt: text(formData, `closes-${dayOfWeek}`) || "20:00",
  }));

  const conditions = conditionsSchema.safeParse({
    minDriverAge: text(formData, "minDriverAge"),
    minLicenceYears: text(formData, "minLicenceYears"),
    mileagePolicy: text(formData, "mileagePolicy"),
    mileageKmPerDay: text(formData, "mileageKmPerDay") || undefined,
    fuelPolicy: text(formData, "fuelPolicy"),
    legalName: text(formData, "legalName"),
    registrationNumber: text(formData, "registrationNumber"),
    taxId: text(formData, "taxId"),
    termsAndConditions: text(formData, "termsAndConditions"),
    fuelPolicyText: text(formData, "fuelPolicyText"),
    mileagePolicyText: text(formData, "mileagePolicyText"),
    damagePolicyText: text(formData, "damagePolicyText"),
    cancellationText: text(formData, "cancellationText"),
    depositPolicyText: text(formData, "depositPolicyText"),
    footerText: text(formData, "footerText"),
  });
  if (!conditions.success) return { errors: fieldErrors(conditions.error) };

  await updateWorkingHours(ctx.db, ctx.db.$agencyId, days);
  await updateConditions(ctx.db, ctx.db.$agencyId, conditions.data);
  await audit(ctx, "settings.operations_update", {
    minDriverAge: conditions.data.minDriverAge,
  });

  revalidateAll(slug);
  return { saved: true };
}
