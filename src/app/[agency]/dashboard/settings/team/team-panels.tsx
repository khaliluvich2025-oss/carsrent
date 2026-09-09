"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { IconPlus } from "@/components/ui/icons";
import type { TeamState } from "./actions";

type Action = (state: TeamState, formData: FormData) => Promise<TeamState>;

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export type TeamMember = {
  id: string;
  fullName: string;
  username: string;
  role: "OWNER" | "EMPLOYEE";
  isActive: boolean;
  lastLogin: string | null;
  activeSessions: number;
  isSelf: boolean;
};

export function TeamList({
  members,
  toggleAction,
  resetAction,
  createAction,
}: {
  members: TeamMember[];
  toggleAction: (formData: FormData) => Promise<void>;
  resetAction: Action;
  createAction: Action;
}) {
  const [adding, setAdding] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [createState, createFormAction] = useActionState<TeamState, FormData>(
    async (prev, formData) => {
      const result = await createAction(prev, formData);
      if (result.saved) setAdding(false);
      return result;
    },
    {},
  );

  const [resetState, resetFormAction] = useActionState<TeamState, FormData>(
    async (prev, formData) => {
      const result = await resetAction(prev, formData);
      if (result.saved) setResettingId(null);
      return result;
    },
    {},
  );

  const createErrors = createState.errors ?? {};

  return (
    <div className="space-y-3">
      {resetState.saved && resetState.message ? (
        <p className="rounded-lg border border-positive/20 bg-positive-soft px-3 py-2.5 text-sm text-positive">
          {resetState.message}
        </p>
      ) : null}

      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-card border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">
                    {member.fullName}
                  </p>
                  <Badge tone={member.role === "OWNER" ? "brand" : "neutral"}>
                    {member.role === "OWNER" ? "Owner" : "Employee"}
                  </Badge>
                  {!member.isActive ? <Badge tone="critical">Disabled</Badge> : null}
                  {member.isSelf ? <Badge tone="info">You</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  @{member.username}
                  {member.lastLogin
                    ? ` · last signed in ${member.lastLogin}`
                    : " · never signed in"}
                  {member.activeSessions > 0
                    ? ` · ${member.activeSessions} active session${member.activeSessions === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setResettingId(resettingId === member.id ? null : member.id)
                  }
                >
                  Reset password
                </Button>

                {!member.isSelf ? (
                  <form action={toggleAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={member.isActive ? "0" : "1"}
                    />
                    <Button
                      type="submit"
                      variant={member.isActive ? "ghost" : "secondary"}
                      size="sm"
                    >
                      {member.isActive ? "Disable" : "Enable"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>

            {resettingId === member.id ? (
              <form
                action={resetFormAction}
                className="mt-3 space-y-3 rounded-lg bg-surface-sunken p-3"
              >
                <input type="hidden" name="userId" value={member.id} />
                <FormError>
                  {resetState.saved ? undefined : resetState.message}
                </FormError>
                <Field
                  label="New password"
                  htmlFor={`pw-${member.id}`}
                  required
                  error={resetState.errors?.password}
                  hint={
                    member.isSelf
                      ? "Signs out your other devices. You stay signed in here."
                      : "Signs them out everywhere. Tell them the new password directly."
                  }
                >
                  <Input
                    id={`pw-${member.id}`}
                    name="password"
                    type="text"
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setResettingId(null)}
                  >
                    Cancel
                  </Button>
                  <Save label="Reset password" />
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {adding ? (
        <Card>
          <CardHeader title="New team member" />
          <form action={createFormAction} className="space-y-4">
            <FormError>{createState.message}</FormError>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                htmlFor="t-name"
                required
                error={createErrors.fullName}
              >
                <Input id="t-name" name="fullName" required />
              </Field>

              <Field
                label="Username"
                htmlFor="t-username"
                required
                error={createErrors.username}
                hint="What they type to sign in."
              >
                <Input
                  id="t-username"
                  name="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </Field>

              <Field label="Role" htmlFor="t-role" error={createErrors.role}>
                <Select id="t-role" name="role" defaultValue="EMPLOYEE">
                  <option value="EMPLOYEE">
                    Employee — daily operations
                  </option>
                  <option value="OWNER">Owner — full access</option>
                </Select>
              </Field>

              <Field label="Phone" htmlFor="t-phone" error={createErrors.phone}>
                <Input id="t-phone" name="phone" type="tel" />
              </Field>

              <Field
                label="Password"
                htmlFor="t-password"
                required
                error={createErrors.password}
                hint="At least 10 characters. Give it to them directly."
                className="sm:col-span-2"
              >
                <Input
                  id="t-password"
                  name="password"
                  type="text"
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
              <Save label="Add member" />
            </div>
          </form>
        </Card>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <IconPlus size={16} />
          Add team member
        </Button>
      )}
    </div>
  );
}
