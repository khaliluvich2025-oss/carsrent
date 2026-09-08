import { createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/env";
import { isSafeKey, type StorageDriver, type UploadResult } from "./driver";

/**
 * Development storage on local disk.
 *
 * Deliberately mirrors the S3 driver's shape rather than taking shortcuts:
 * objects live under a bucket-named directory, public ones are served by a
 * route, and private ones need a signed URL that expires. Code written against
 * this behaves the same way in production — which is the point of having it,
 * rather than letting every upload path stay untested until S3 credentials
 * appear.
 *
 * Files land in `.storage/` at the project root, which is gitignored.
 */

const ROOT = path.resolve(process.cwd(), ".storage");
const PUBLIC_BUCKET = "public";
const PRIVATE_BUCKET = "private";

function resolvePath(bucket: string, key: string): string {
  if (!isSafeKey(key)) throw new Error("Unsafe storage key");
  if (bucket !== PUBLIC_BUCKET && bucket !== PRIVATE_BUCKET) {
    throw new Error("Unknown bucket");
  }

  const full = path.resolve(ROOT, bucket, key);
  // Belt and braces: even with a validated key, confirm the resolved path is
  // still inside the bucket directory before touching the filesystem.
  const bucketRoot = path.resolve(ROOT, bucket);
  if (!full.startsWith(bucketRoot + path.sep)) {
    throw new Error("Storage key escapes the bucket");
  }
  return full;
}

/**
 * Signature for a private object URL. Uses SESSION_SECRET so a link cannot be
 * forged, and carries its own expiry so an old link stops working — the same
 * properties an S3 presigned URL has.
 */
export function signLocalKey(key: string, expiresAt: number): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${key}:${expiresAt}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyLocalSignature(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signLocalKey(key, expiresAt);
  if (expected.length !== signature.length) return false;

  // Constant-time comparison, so a signature cannot be guessed byte by byte.
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return diff === 0;
}

export const localDriver: StorageDriver = {
  name: "local",

  isConfigured() {
    return true;
  },

  async upload(input): Promise<UploadResult> {
    const bucket: string =
      input.visibility === "PUBLIC" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const target = resolvePath(bucket, input.key);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.body);

    return {
      bucket,
      key: input.key,
      publicUrl:
        input.visibility === "PUBLIC" ? `/api/storage/${input.key}` : null,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    };
  },

  async delete(bucket, key) {
    await unlink(resolvePath(bucket, key)).catch(() => {
      // Already gone is the desired end state.
    });
  },

  async signedUrl(_bucket, key, expiresInSeconds) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = signLocalKey(key, expiresAt);
    return `/api/storage/private/${key}?expires=${expiresAt}&sig=${signature}`;
  },

  async read(bucket, key) {
    return readFile(resolvePath(bucket, key));
  },
};

export const LOCAL_PUBLIC_BUCKET = PUBLIC_BUCKET;
export const LOCAL_PRIVATE_BUCKET = PRIVATE_BUCKET;
