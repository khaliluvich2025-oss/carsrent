"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { ContractState } from "./actions";

function SignButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? "Saving signature…" : "Sign and accept"}
    </Button>
  );
}

/**
 * Signature capture (spec §52).
 *
 * A canvas driven by pointer events, so it works with a finger on a phone, a
 * stylus on a tablet and a mouse on the desk — the same handover happens in all
 * three places. The bitmap is written into a hidden field as a PNG data URL and
 * submitted with the form; there is no separate upload step to fail halfway.
 */
export function SignaturePad({
  action,
  contractId,
  defaultSignerName,
}: {
  action: (
    state: ContractState,
    formData: FormData,
  ) => Promise<ContractState>;
  contractId: string;
  defaultSignerName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const [state, formAction] = useActionState<ContractState, FormData>(
    action,
    {},
  );

  // Size the backing store to the device pixel ratio, or the stroke is blurry
  // on exactly the phones this is used on.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
  }, []);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) setSignatureData(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setSignatureData("");
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="signatureData" value={signatureData} />

      <FormError>{state.message}</FormError>

      <Field label="Name of the person signing" htmlFor="signer-name" required>
        <Input
          id="signer-name"
          name="signerName"
          defaultValue={defaultSignerName}
          required
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink-soft">Signature</span>
          {hasInk ? (
            <button
              type="button"
              onClick={clear}
              className="text-xs font-medium text-ink-muted hover:text-ink"
            >
              Clear
            </button>
          ) : null}
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="h-44 w-full touch-none rounded-lg border-2 border-dashed border-line-strong bg-surface"
          aria-label="Signature area"
        />
        {!hasInk ? (
          <p className="mt-1 text-xs text-ink-muted">
            Ask the customer to sign above with a finger or stylus.
          </p>
        ) : null}
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="termsAccepted"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-line-strong"
        />
        <span className="text-sm text-ink">
          The customer has read and accepts the rental conditions above.
        </span>
      </label>

      <SignButton disabled={!hasInk || !accepted || !signatureData} />
    </form>
  );
}
