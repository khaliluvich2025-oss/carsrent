"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { IconAlert } from "@/components/ui/icons";

/**
 * Dashboard error boundary.
 *
 * A permission guard that refuses a route throws, and lands here. The message is
 * deliberately not echoed back — in production Next redacts it anyway, and a
 * server error string is not something to show an agency employee mid-handover.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-critical-soft text-critical">
        <IconAlert size={24} />
      </span>
      <h1 className="text-lg font-semibold text-ink">
        This page could not be opened
      </h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        You may not have access to it, or something went wrong on our side. If
        this keeps happening, ask the agency owner to check your permissions.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-ink-muted">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-6">
        <Button onClick={reset} variant="secondary">
          Try again
        </Button>
      </div>
    </div>
  );
}
