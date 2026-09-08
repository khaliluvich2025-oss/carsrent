import { env } from "@/env";
import type { StorageDriver, Visibility } from "./driver";
import { localDriver } from "./local-driver";
import { s3Driver } from "./s3-driver";

/**
 * Driver selection.
 *
 * `STORAGE_DRIVER` decides explicitly. With no setting, S3 is used when it is
 * fully configured and local disk otherwise — so a developer who has just
 * cloned the repo can upload a vehicle photo immediately, and production
 * behaves as it always did the moment the S3 variables are present.
 *
 * Local disk is refused in production: silently writing customer documents to a
 * container's filesystem would look like it worked right up until the container
 * restarted.
 */
function selectDriver(): StorageDriver {
  const explicit = env.STORAGE_DRIVER;

  if (explicit === "s3") return s3Driver;
  if (explicit === "local") {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "STORAGE_DRIVER=local is not allowed in production — files would not survive a restart.",
      );
    }
    return localDriver;
  }

  if (s3Driver.isConfigured()) return s3Driver;
  return env.NODE_ENV === "production" ? s3Driver : localDriver;
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  cached ??= selectDriver();
  return cached;
}

export function isStorageConfigured(): boolean {
  try {
    return storage().isConfigured();
  } catch {
    return false;
  }
}

/** Which driver is in use, for the settings and diagnostics screens. */
export function storageDriverName(): string {
  try {
    return storage().name;
  } catch {
    return "none";
  }
}

export async function uploadObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  visibility: Visibility;
}) {
  return storage().upload(input);
}

export async function deleteObject(bucket: string, key: string) {
  return storage().delete(bucket, key);
}

export async function signedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 300,
) {
  return storage().signedUrl(bucket, key, expiresInSeconds);
}

export async function readObject(bucket: string, key: string) {
  return storage().read(bucket, key);
}

export {
  buildKey,
  IMAGE_TYPES,
  isSafeKey,
  MAX_IMAGE_BYTES,
  StorageNotConfiguredError,
  type UploadResult,
  type Visibility,
} from "./driver";
