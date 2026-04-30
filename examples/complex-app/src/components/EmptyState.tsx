import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6 flex flex-col items-center gap-2">
      {icon && (
        <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 grid place-items-center text-zinc-500 dark:text-zinc-400 mb-2">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </div>
      {description && (
        <div className="text-[13px] text-zinc-500 dark:text-zinc-400 max-w-sm">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
