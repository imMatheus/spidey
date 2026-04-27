import type { ReactNode } from "react";

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={"toggle" + (disabled ? " is-disabled" : "")}>
      <span className={"toggle-switch" + (checked ? " is-on" : "")}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}
