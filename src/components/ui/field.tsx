import type { ComponentProps, ReactNode } from "react";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm " +
  "placeholder:text-ink-muted transition " +
  "focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-line)] " +
  "disabled:bg-surface-sunken disabled:text-ink-muted " +
  "aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/20";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-ink-soft"
      >
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={`${CONTROL} h-11 ${className ?? ""}`} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`${CONTROL} h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%238791a5"><path d="M5.5 7.5 10 12l4.5-4.5"/></svg>')] bg-[length:18px] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${className ?? ""}`}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={`${CONTROL} py-2.5 ${className ?? ""}`} {...props} />
  );
}

/** Input with a trailing unit, e.g. a price in MAD or a distance in km. */
export function InputWithSuffix({
  suffix,
  className,
  ...props
}: ComponentProps<"input"> & { suffix: string }) {
  return (
    <div className="relative">
      <input className={`${CONTROL} h-11 pr-16 ${className ?? ""}`} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-muted">
        {suffix}
      </span>
    </div>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2.5 text-sm text-critical"
    >
      {children}
    </p>
  );
}
