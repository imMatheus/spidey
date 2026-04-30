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
    "rounded-lg overflow-hidden bg-white dark:bg-zinc-900",
    elevated
      ? "shadow-md border border-transparent"
      : "border border-zinc-200 dark:border-zinc-800",
    hoverable
      ? "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      {(title || subtitle) && (
        <div className="px-[18px] pt-4">
          {title && (
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      )}
      {children && (
        <div className="px-[18px] py-4 flex flex-col gap-3">{children}</div>
      )}
      {footer && (
        <div className="px-[18px] py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          {footer}
        </div>
      )}
    </div>
  );
}
