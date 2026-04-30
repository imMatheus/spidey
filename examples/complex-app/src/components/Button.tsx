import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-indigo-500 text-white hover:not-disabled:bg-indigo-600 border-transparent",
  secondary:
    "bg-zinc-900 text-white hover:not-disabled:bg-zinc-700 border-transparent dark:bg-zinc-100 dark:text-zinc-900 dark:hover:not-disabled:bg-white",
  outline:
    "bg-transparent text-zinc-900 border-zinc-300 hover:not-disabled:bg-zinc-100 dark:text-zinc-100 dark:border-zinc-700 dark:hover:not-disabled:bg-zinc-800",
  ghost:
    "bg-transparent text-zinc-700 border-transparent hover:not-disabled:bg-zinc-100 hover:not-disabled:text-zinc-900 dark:text-zinc-300 dark:hover:not-disabled:bg-zinc-800 dark:hover:not-disabled:text-zinc-100",
  danger:
    "bg-red-600 text-white hover:not-disabled:bg-red-700 border-transparent",
};

const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-[13px]",
  lg: "px-[18px] py-[11px] text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  loading,
  fullWidth,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    "inline-flex items-center justify-center gap-2 border rounded-md font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && (
        <span
          className="w-3 h-3 rounded-full border-2 border-white/40 border-t-current animate-spin"
          aria-hidden
        />
      )}
      {!loading && iconLeft && (
        <span className="inline-flex [&>svg]:w-3.5 [&>svg]:h-3.5">
          {iconLeft}
        </span>
      )}
      <span>{children}</span>
      {!loading && iconRight && (
        <span className="inline-flex [&>svg]:w-3.5 [&>svg]:h-3.5">
          {iconRight}
        </span>
      )}
    </button>
  );
}
