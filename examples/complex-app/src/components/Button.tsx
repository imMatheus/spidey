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
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    fullWidth ? "btn-full" : "",
    loading ? "is-loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="btn-spinner" aria-hidden />}
      {!loading && iconLeft && <span className="btn-icon">{iconLeft}</span>}
      <span className="btn-label">{children}</span>
      {!loading && iconRight && <span className="btn-icon">{iconRight}</span>}
    </button>
  );
}
