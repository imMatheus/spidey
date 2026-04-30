import { StarIcon } from "../icons";

export function Rating({
  value,
  max = 5,
  size = 14,
  showValue,
}: {
  value: number;
  max?: number;
  size?: number;
  showValue?: boolean;
}) {
  const filled = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`${value.toFixed(1)} out of ${max}`}
    >
      <span className="inline-flex gap-px">
        {Array.from({ length: max }).map((_, i) => {
          const on = i < filled;
          return (
            <StarIcon
              key={i}
              width={size}
              height={size}
              className={
                on
                  ? "text-amber-500 fill-current"
                  : "text-zinc-300 dark:text-zinc-700"
              }
            />
          );
        })}
      </span>
      {showValue && (
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {value.toFixed(1)}
        </span>
      )}
    </span>
  );
}
