import { NextResponse } from "next/server";

import { env } from "@/env";
import { isSafeKey } from "@/server/storage/driver";
import {
  LOCAL_PRIVATE_BUCKET,
  LOCAL_PUBLIC_BUCKET,
  localDriver,
  verifyLocalSignature,
} from "@/server/storage/local-driver";

/**
 * Serves objects held by the local development storage driver.
 *
 * Two shapes, mirroring what S3 gives us in production:
 *   /api/storage/<key>                 public object, cacheable
 *   /api/storage/private/<key>?...     private object, signed and expiring
 *
 * Disabled entirely in production: if this route ever answered there, it would
 * mean customer documents were being served off a container's local disk.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { path } = await params;
  const segments = path ?? [];
  if (segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isPrivate = segments[0] === "private";
  const key = (isPrivate ? segments.slice(1) : segments).join("/");

  if (!isSafeKey(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isPrivate) {
    const url = new URL(request.url);
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("sig") ?? "";

    // Same contract as an S3 presigned URL: unforgeable, and it stops working.
    if (!verifyLocalSignature(key, expires, signature)) {
      return NextResponse.json({ error: "Link expired" }, { status: 403 });
    }
  }

  try {
    const body = await localDriver.read(
      isPrivate ? LOCAL_PRIVATE_BUCKET : LOCAL_PUBLIC_BUCKET,
      key,
    );

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": guessContentType(key),
        "Cache-Control": isPrivate
          ? "private, no-store"
          : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
};

function guessContentType(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[extension] ?? "application/octet-stream";
}
