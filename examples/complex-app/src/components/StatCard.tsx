import type { ReactNode } from "react";
import { TrendingUpIcon, TrendingDownIcon } from "../icons";

type Trend = "up" | "down" | "flat";

const TREND: Record<Trend, string> = {
  up: "text-green-600 dark:text-green-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-zinc-400 dark:text-zinc-500",
};

export function StatCard({
  label,
  value,
  delta,
  trend = "flat",
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: Trend;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          {label}
        </span>
        {icon && (
          <span className="w-[26px] h-[26px] rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 grid place-items-center [&>svg]:w-3.5 [&>svg]:h-3.5">
            {icon}
          </span>
        )}
      </div>
      <div className="text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      {delta && (
        <div
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${TREND[trend]}`}
        >
          {trend === "up" && <TrendingUpIcon width={12} height={12} />}
          {trend === "down" && <TrendingDownIcon width={12} height={12} />}
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}
