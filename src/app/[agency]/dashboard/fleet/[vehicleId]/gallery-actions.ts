"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/server/auth/guards";
import {
  buildKey,
  deleteObject,
  IMAGE_TYPES,
  isStorageConfigured,
  MAX_IMAGE_BYTES,
  StorageNotConfiguredError,
  uploadObject,
} from "@/server/storage";

export type GalleryState = { error?: string; uploaded?: number };

const MAX_FILES_PER_UPLOAD = 10;

/**
 * Vehicle photos (spec §17).
 *
 * Uploaded through the server rather than a browser-to-S3 presigned PUT: the
 * files are small, and routing them through here means content type and size are
 * checked by code the client cannot skip, and the StoredFile row and the object
 * are written in the same request.
 */
export async function uploadVehicleImagesAction(
  agencySlug: string,
  vehicleId: string,
  _prev: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  const ctx = await requirePermission("fleet.manage");

  if (!isStorageConfigured()) {
    return { error: new StorageNotConfiguredError().message };
  }

  // Confirm the vehicle belongs to this agency before writing anything.
  const vehicle = await ctx.db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!vehicle) return { error: "Vehicle not found." };

  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) return { error: "Choose at least one photo." };
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return { error: `Upload at most ${MAX_FILES_PER_UPLOAD} photos at a time.` };
  }

  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      return { error: `${file.name} is not a JPEG, PNG, WebP or AVIF image.` };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: `${file.name} is larger than 8 MB.` };
    }
  }

  let sortOrder = vehicle._count.images;
  let isFirstEver = vehicle._count.images === 0;

  for (const file of files) {
    const key = buildKey({
      agencyId: ctx.db.$agencyId,
      entity: "vehicles",
      entityId: vehicleId,
      filename: file.name,
    });

    const uploaded = await uploadObject({
      key,
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

    await ctx.db.vehicleImage.create({
      data: {
        agencyId: ctx.db.$agencyId,
        vehicleId,
        fileId: stored.id,
        // The first photo a vehicle ever gets becomes its cover automatically.
        isCover: isFirstEver,
        sortOrder,
      },
    });

    isFirstEver = false;
    sortOrder += 1;
  }

  revalidatePath(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
  revalidatePath(`/${agencySlug}/dashboard/fleet`);
  return { uploaded: files.length };
}

export async function setCoverImageAction(
  agencySlug: string,
  vehicleId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("fleet.manage");
  const imageId = formData.get("imageId")?.toString();
  if (!imageId) return;

  // Scoped to this agency by the tenant client, and to this vehicle explicitly.
  const image = await ctx.db.vehicleImage.findFirst({
    where: { id: imageId, vehicleId },
    select: { id: true },
  });
  if (!image) return;

  await ctx.db.$transaction([
    ctx.db.vehicleImage.updateMany({
      where: { vehicleId },
      data: { isCover: false },
    }),
    ctx.db.vehicleImage.update({
      where: { id: imageId },
      data: { isCover: true },
    }),
  ]);

  revalidatePath(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
  revalidatePath(`/${agencySlug}/dashboard/fleet`);
}

export async function deleteVehicleImageAction(
  agencySlug: string,
  vehicleId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("fleet.manage");
  const imageId = formData.get("imageId")?.toString();
  if (!imageId) return;

  const image = await ctx.db.vehicleImage.findFirst({
    where: { id: imageId, vehicleId },
    select: {
      id: true,
      isCover: true,
      fileId: true,
      file: { select: { bucket: true, key: true } },
    },
  });
  if (!image) return;

  await ctx.db.vehicleImage.delete({ where: { id: image.id } });
  await ctx.db.storedFile.delete({ where: { id: image.fileId } });

  // The object is best-effort: the row is gone either way, and an orphaned
  // object costs storage rather than correctness.
  try {
    await deleteObject(image.file.bucket, image.file.key);
  } catch {
    // Swallowed deliberately — see above.
  }

  // Never leave a vehicle with photos but no cover.
  if (image.isCover) {
    const next = await ctx.db.vehicleImage.findFirst({
      where: { vehicleId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (next) {
      await ctx.db.vehicleImage.update({
        where: { id: next.id },
        data: { isCover: true },
      });
    }
  }

  revalidatePath(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
  revalidatePath(`/${agencySlug}/dashboard/fleet`);
}
