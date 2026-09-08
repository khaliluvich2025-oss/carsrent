"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { IconAlert } from "@/components/ui/icons";
import type { Translator } from "@/lib/i18n";
import type { BookingState } from "./actions";

function SubmitButton({ labels }: { labels: Translator }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? labels("book.confirming") : labels("book.confirm")}
    </Button>
  );
}

export function BookingForm({
  action,
  labels,
  extras,
  alternativesHref,
  currency,
}: {
  action: (state: BookingState, formData: FormData) => Promise<BookingState>;
  labels: Translator;
  extras: { id: string; name: string; description: string | null; price: string; perDay: boolean }[];
  alternativesHref: string;
  currency: string;
}) {
  const [state, formAction] = useActionState<BookingState, FormData>(
    action,
    {},
  );
  const errors = state.errors ?? {};

  // The car was taken during checkout — spec §92's customer-facing outcome.
  if (state.unavailable) {
    return (
      <Card>
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-caution-soft text-caution">
            <IconAlert size={24} />
          </span>
          <h2 className="text-base font-semibold text-ink">
            {labels("book.taken")}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            {labels("book.takenHint")}
          </p>
          <Link
            href={alternativesHref}
            className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)]"
          >
            {labels("book.seeAlternatives")}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <h2 className="text-sm font-semibold text-ink">{labels("book.title")}</h2>
        <p className="mt-0.5 mb-4 text-sm text-ink-muted">
          {labels("book.subtitle")}
        </p>

        <FormError>{errors._form}</FormError>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label={labels("book.fullName")}
            htmlFor="fullName"
            required
            error={errors.fullName}
            className="sm:col-span-2"
          >
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              aria-invalid={Boolean(errors.fullName)}
              required
            />
          </Field>

          <Field
            label={labels("book.phone")}
            htmlFor="phone"
            required
            error={errors.phone}
            hint={labels("book.phoneHint")}
            className="sm:col-span-2"
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+212 6…"
              aria-invalid={Boolean(errors.phone)}
              required
            />
          </Field>

          <Field
            label={`${labels("book.email")} (${labels("book.optional")})`}
            htmlFor="email"
            error={errors.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>

          <Field
            label={`${labels("book.nationality")} (${labels("book.optional")})`}
            htmlFor="nationality"
            error={errors.nationality}
          >
            <Input
              id="nationality"
              name="nationality"
              autoComplete="country-name"
            />
          </Field>

          <Field
            label={`${labels("book.notes")} (${labels("book.optional")})`}
            htmlFor="customerNote"
            error={errors.customerNote}
            className="sm:col-span-2"
          >
            <Textarea id="customerNote" name="customerNote" rows={2} />
          </Field>
        </div>
      </Card>

      {extras.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {labels("book.extras")}
          </h2>
          <div className="space-y-2">
            {extras.map((extra) => (
              <label
                key={extra.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 transition hover:border-line-strong"
              >
                <input
                  type="checkbox"
                  name="extras"
                  value={extra.id}
                  className="mt-0.5 h-5 w-5 rounded border-line-strong"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex justify-between gap-3">
                    <span className="font-medium text-ink">{extra.name}</span>
                    <span className="shrink-0 font-medium text-ink tabular-nums">
                      {extra.price} {currency}
                      {extra.perDay ? " /d" : ""}
                    </span>
                  </span>
                  {extra.description ? (
                    <span className="block text-ink-muted">
                      {extra.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      <SubmitButton labels={labels} />

      <p className="text-center text-xs text-ink-muted">
        {labels("book.terms")}
      </p>
    </form>
  );
}
