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
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={"tab" + (active ? " is-active" : "")}
            onClick={() => onChange(t.id)}
          >
            {t.icon && <span className="tab-icon">{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
