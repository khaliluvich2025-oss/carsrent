"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { IconCheck, IconImage, IconPlus } from "@/components/ui/icons";
import type { GalleryState } from "./gallery-actions";

export type GalleryImage = {
  id: string;
  url: string | null;
  isCover: boolean;
};

function UploadButton({ storageReady }: { storageReady: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      disabled={pending || !storageReady}
    >
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

export function VehicleGallery({
  images,
  canManage,
  storageReady,
  uploadAction,
  setCoverAction,
  deleteAction,
}: {
  images: GalleryImage[];
  canManage: boolean;
  storageReady: boolean;
  uploadAction: (
    state: GalleryState,
    formData: FormData,
  ) => Promise<GalleryState>;
  setCoverAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [state, formAction] = useActionState<GalleryState, FormData>(
    uploadAction,
    {},
  );
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface-sunken px-6 py-10 text-center">
          <span className="mb-2 text-ink-muted/60">
            <IconImage size={32} />
          </span>
          <p className="text-sm font-medium text-ink">No photos yet</p>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            Cars with photos get booked more often. The first photo you add
            becomes the cover shown on the website.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-lg border border-line bg-surface-sunken"
            >
              <div className="aspect-[4/3]">
                {image.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={image.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-muted/40">
                    <IconImage size={28} />
                  </div>
                )}
              </div>

              {image.isCover ? (
                <div className="absolute top-2 left-2">
                  <Badge tone="brand">
                    <IconCheck size={12} />
                    Cover
                  </Badge>
                </div>
              ) : null}

              {canManage ? (
                <div className="flex items-center justify-between gap-1 border-t border-line bg-surface px-2 py-1.5">
                  {image.isCover ? (
                    <span className="px-1 text-[11px] text-ink-muted">
                      Shown first
                    </span>
                  ) : (
                    <form action={setCoverAction}>
                      <input type="hidden" name="imageId" value={image.id} />
                      <button
                        type="submit"
                        className="rounded px-1 text-[11px] font-medium text-ink-soft transition hover:text-ink"
                      >
                        Make cover
                      </button>
                    </form>
                  )}
                  <form action={deleteAction}>
                    <input type="hidden" name="imageId" value={image.id} />
                    <button
                      type="submit"
                      className="rounded px-1 text-[11px] font-medium text-ink-muted transition hover:text-critical"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={formAction} className="space-y-2">
          <FormError>{state.error}</FormError>

          {!storageReady ? (
            <p className="rounded-lg border border-caution/20 bg-caution-soft px-3 py-2.5 text-sm text-caution">
              Photo upload needs object storage. Set the <code>S3_*</code>{" "}
              variables in <code>.env</code> to turn it on — everything else on
              this page works without it.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id="vehicle-images"
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              disabled={!storageReady}
              className="sr-only"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!storageReady}
              onClick={() => inputRef.current?.click()}
            >
              <IconPlus size={16} />
              Choose photos
            </Button>
            <UploadButton storageReady={storageReady} />
            {state.uploaded ? (
              <span className="text-sm text-positive">
                {state.uploaded} photo{state.uploaded === 1 ? "" : "s"} added
              </span>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">
            JPEG, PNG, WebP or AVIF · up to 8 MB each · 10 at a time
          </p>
        </form>
      ) : null}
    </div>
  );
}
