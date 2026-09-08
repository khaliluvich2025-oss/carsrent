import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import {
  StorageNotConfiguredError,
  type StorageDriver,
  type UploadResult,
} from "./driver";

/**
 * S3-compatible object storage (spec §85).
 *
 * Two buckets, and the split is a security boundary rather than a convenience:
 *
 *   PUBLIC  — vehicle photos, agency logos, hero images. Anonymous visitors must
 *             be able to render these on the client website.
 *   PRIVATE — customer identity documents, inspection and damage photos, signed
 *             contracts, signatures. Never a permanent URL; reached only through
 *             an authorised route that issues a short-lived signed GET.
 */

let client: S3Client | null = null;

function isConfigured(): boolean {
  return Boolean(
    env.S3_ENDPOINT &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_BUCKET_PUBLIC &&
      env.S3_BUCKET_PRIVATE &&
      env.S3_PUBLIC_BASE_URL,
  );
}

function getClient(): S3Client {
  if (!isConfigured()) throw new StorageNotConfiguredError();
  client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
    },
  });
  return client;
}

export const s3Driver: StorageDriver = {
  name: "s3",

  isConfigured,

  async upload(input): Promise<UploadResult> {
    const s3 = getClient();
    const bucket =
      input.visibility === "PUBLIC"
        ? (env.S3_BUCKET_PUBLIC as string)
        : (env.S3_BUCKET_PRIVATE as string);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl:
          input.visibility === "PUBLIC"
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
      }),
    );

    return {
      bucket,
      key: input.key,
      publicUrl:
        input.visibility === "PUBLIC"
          ? `${(env.S3_PUBLIC_BASE_URL as string).replace(/\/$/, "")}/${input.key}`
          : null,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    };
  },

  async delete(bucket, key) {
    const s3 = getClient();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  async signedUrl(bucket, key, expiresInSeconds) {
    const s3 = getClient();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  },

  async read(bucket, key) {
    const s3 = getClient();
    const result = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object has no body");
    return Buffer.from(bytes);
  },
};
