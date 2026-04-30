import type { ReactNode } from "react";

export type Tab = { id: string; label: ReactNode; icon?: ReactNode };

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="flex gap-0.5 border-b border-zinc-200 dark:border-zinc-800 mb-6"
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 bg-transparent border-0 border-b-2 -mb-px text-[13px] cursor-pointer ${
              active
                ? "text-indigo-600 dark:text-indigo-400 border-indigo-500 font-semibold"
                : "text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {t.icon && <span className="inline-flex">{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
