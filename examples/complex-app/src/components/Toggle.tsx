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
    <label
      className={`inline-flex items-center gap-2.5 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked
            ? "bg-indigo-500"
            : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-inherit m-0"
        />
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {label && (
        <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
      )}
    </label>
  );
}
