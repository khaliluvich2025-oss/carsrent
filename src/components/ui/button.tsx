import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
  "disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm hover:brightness-110 active:brightness-95",
  secondary:
    "border border-line bg-surface text-ink shadow-sm hover:bg-surface-sunken hover:border-line-strong",
  ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
  danger:
    "border border-critical/20 bg-critical-soft text-critical hover:bg-critical hover:text-white",
};

const SIZES: Record<Size, string> = {
  // 44px tall — a real touch target for employees working on a phone
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

function classes(variant: Variant, size: Size, className?: string) {
  return [BASE, VARIANTS[variant], SIZES[size], className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={classes(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
