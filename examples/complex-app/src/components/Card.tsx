import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  footer,
  hoverable,
  elevated,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  hoverable?: boolean;
  elevated?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const cls = [
    "card",
    hoverable ? "card-hoverable" : "",
    elevated ? "card-elevated" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      {(title || subtitle) && (
        <div className="card-header">
          {title && <div className="card-title">{title}</div>}
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
      )}
      {children && <div className="card-body">{children}</div>}
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}
