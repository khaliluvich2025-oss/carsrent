"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";

export type MessageOption = {
  key: string;
  label: string;
  description: string;
  body: string;
};

/**
 * Prepared WhatsApp messages (spec §68).
 *
 * The text is editable before sending: a template that cannot be adjusted gets
 * abandoned the first time it does not quite fit. The link opens WhatsApp with
 * whatever is in the box.
 */
export function MessagePicker({
  templates,
  phoneDigits,
}: {
  templates: MessageOption[];
  phoneDigits: string;
}) {
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const selected = templates.find((template) => template.key === key);
  const [body, setBody] = useState(selected?.body ?? "");
  const [edited, setEdited] = useState(false);

  const choose = (nextKey: string) => {
    setKey(nextKey);
    const next = templates.find((template) => template.key === nextKey);
    setBody(next?.body ?? "");
    setEdited(false);
  };

  if (templates.length === 0) return null;

  return (
    <div className="space-y-3">
      <Select
        value={key}
        onChange={(event) => choose(event.target.value)}
        aria-label="Message template"
      >
        {templates.map((template) => (
          <option key={template.key} value={template.key}>
            {template.label}
          </option>
        ))}
      </Select>

      {selected ? (
        <p className="text-xs text-ink-muted">{selected.description}</p>
      ) : null}

      <Textarea
        value={body}
        rows={7}
        onChange={(event) => {
          setBody(event.target.value);
          setEdited(true);
        }}
        aria-label="Message"
        className="font-normal"
      />

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(body)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)]"
        >
          Open in WhatsApp
        </a>
        {edited ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => choose(key)}
          >
            Reset text
          </Button>
        ) : null}
      </div>
    </div>
  );
}
