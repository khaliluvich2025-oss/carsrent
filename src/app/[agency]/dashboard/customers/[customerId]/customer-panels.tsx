"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import type { CustomerActionState } from "../actions";

type Action = (
  state: CustomerActionState,
  formData: FormData,
) => Promise<CustomerActionState>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ContactPanel({
  action,
  customerId,
  values,
}: {
  action: Action;
  customerId: string;
  values: {
    fullName: string;
    phone: string;
    email: string;
    nationality: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<CustomerActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.saved) setOpen(false);
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Edit details
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader title="Edit contact details" />
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="customerId" value={customerId} />
        <FormError>{state.message}</FormError>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            htmlFor="c-name"
            required
            error={errors.fullName}
            className="sm:col-span-2"
          >
            <Input
              id="c-name"
              name="fullName"
              defaultValue={values.fullName}
              aria-invalid={Boolean(errors.fullName)}
              required
            />
          </Field>

          <Field
            label="Phone"
            htmlFor="c-phone"
            required
            error={errors.phone}
            hint="Used to match returning customers and to find their booking."
          >
            <Input
              id="c-phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              aria-invalid={Boolean(errors.phone)}
              required
            />
          </Field>

          <Field label="Email" htmlFor="c-email" error={errors.email}>
            <Input
              id="c-email"
              name="email"
              type="email"
              defaultValue={values.email}
              aria-invalid={Boolean(errors.email)}
            />
          </Field>

          <Field
            label="Country"
            htmlFor="c-nationality"
            error={errors.nationality}
            className="sm:col-span-2"
          >
            <Input
              id="c-nationality"
              name="nationality"
              defaultValue={values.nationality}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Submit label="Save" />
        </div>
      </form>
    </Card>
  );
}

/** Watchlist / blacklist (spec §34). */
export function StatusPanel({
  action,
  customerId,
  current,
}: {
  action: Action;
  customerId: string;
  current: "NORMAL" | "WATCHLIST" | "BLACKLISTED";
}) {
  const [state, formAction] = useActionState<CustomerActionState, FormData>(
    action,
    {},
  );
  const errors = state.errors ?? {};

  return (
    <Card>
      <CardHeader
        title="Customer flag"
        description="Shown on every reservation this customer makes, so whoever takes the confirmation call sees it."
      />
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="customerId" value={customerId} />
        <FormError>{state.message}</FormError>

        <Field label="Status" htmlFor="c-status" error={errors.status}>
          <Select id="c-status" name="status" defaultValue={current}>
            <option value="NORMAL">Normal</option>
            <option value="WATCHLIST">Watchlist — handle with care</option>
            <option value="BLACKLISTED">Blacklisted — do not rent</option>
          </Select>
        </Field>

        <Field
          label="Reason"
          htmlFor="c-status-reason"
          error={errors.reason}
          hint="Saved as a note and to the audit log."
        >
          <Input
            id="c-status-reason"
            name="reason"
            placeholder="Returned the car damaged twice"
          />
        </Field>

        <div className="flex items-center justify-end gap-2">
          {state.saved ? (
            <span className="text-sm text-positive">Saved</span>
          ) : null}
          <Submit label="Update flag" />
        </div>
      </form>
    </Card>
  );
}

/** Internal notes (spec §35). */
export function NotesPanel({
  action,
  deleteAction,
  customerId,
  notes,
}: {
  action: Action;
  deleteAction: (formData: FormData) => Promise<void>;
  customerId: string;
  notes: {
    id: string;
    body: string;
    author: string | null;
    at: string;
  }[];
}) {
  const [state, formAction] = useActionState<CustomerActionState, FormData>(
    action,
    {},
  );
  const errors = state.errors ?? {};

  return (
    <Card>
      <CardHeader
        title="Internal notes"
        description="Only visible to your team. Never shown to the customer."
      />

      <form action={formAction} className="mb-4 space-y-2">
        <input type="hidden" name="customerId" value={customerId} />
        <Field label="Add a note" htmlFor="c-note" error={errors.body}>
          <Textarea
            id="c-note"
            name="body"
            rows={2}
            placeholder="Asked for a child seat next time"
            aria-invalid={Boolean(errors.body)}
          />
        </Field>
        <div className="flex justify-end">
          <Submit label="Add note" />
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-ink-muted">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap text-ink">
                  {note.body}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {note.at}
                  {note.author ? ` · ${note.author}` : ""}
                </p>
              </div>
              <form action={deleteAction} className="shrink-0">
                <input type="hidden" name="noteId" value={note.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-ink-muted transition hover:text-critical"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
