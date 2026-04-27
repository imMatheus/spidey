import type { ReactNode } from "react";
import { TrendingUpIcon, TrendingDownIcon } from "../icons";

type Trend = "up" | "down" | "flat";

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
    <div className="stat">
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {delta && (
        <div className={`stat-trend trend-${trend}`}>
          {trend === "up" && <TrendingUpIcon width={12} height={12} />}
          {trend === "down" && <TrendingDownIcon width={12} height={12} />}
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}
