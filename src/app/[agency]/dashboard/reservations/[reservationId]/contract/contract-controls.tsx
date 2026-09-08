"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import type { ContractState } from "./actions";

function Submit({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function GenerateButton({
  action,
  reservationId,
  label,
  variant = "primary",
}: {
  action: (
    state: ContractState,
    formData: FormData,
  ) => Promise<ContractState>;
  reservationId: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction] = useActionState<ContractState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="reservationId" value={reservationId} />
      <FormError>{state.message}</FormError>
      <Submit label={label} variant={variant} />
      {state.saved && state.amended ? (
        <p className="text-sm text-positive">
          Amendment issued. The signed version is preserved.
        </p>
      ) : null}
    </form>
  );
}

/**
 * Printing is how a contract becomes a PDF in V1: every browser and phone can
 * print to PDF, which avoids shipping a rendering engine for a document that is
 * already laid out for A4.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
