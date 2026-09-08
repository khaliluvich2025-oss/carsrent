import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/guards";
import { readObject, signedDownloadUrl, storage } from "@/server/storage";

/**
 * Authorised access to a private file (spec §85, §97.20).
 *
 * Customer identity documents, inspection photos, signed contracts and
 * signatures never have a permanent URL. Every read passes through here, which
 * checks the session first and then the file's agency — a file id from another
 * tenant simply does not resolve, because the lookup runs on the tenant-scoped
 * client.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const file = await ctx.db.storedFile.findUnique({
    where: { id: fileId },
    select: {
      bucket: true,
      key: true,
      contentType: true,
      visibility: true,
      publicUrl: true,
    },
  });

  // Not found and belongs-to-another-agency are deliberately the same answer.
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (file.visibility === "PUBLIC" && file.publicUrl) {
    return NextResponse.redirect(file.publicUrl);
  }

  // S3 can hand the browser a short-lived URL directly; local disk streams.
  if (storage().name === "s3") {
    const url = await signedDownloadUrl(file.bucket, file.key, 300);
    return NextResponse.redirect(url);
  }

  try {
    const body = await readObject(file.bucket, file.key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": "inline",
        // Private by definition: never let a shared cache hold on to it.
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
