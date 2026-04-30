import type { ReactNode } from "react";

type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

const TONE: Record<Tone, string> = {
  success:
    "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  warning:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
  brand:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  neutral:
    "bg-zinc-50 text-zinc-700 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
};

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[2px] rounded-full text-[11px] font-semibold capitalize ${TONE[tone]}`}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
      )}
      {children}
    </span>
  );
}
