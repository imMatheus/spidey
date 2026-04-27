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
    <span className="rating" aria-label={`${value.toFixed(1)} out of ${max}`}>
      <span className="rating-stars">
        {Array.from({ length: max }).map((_, i) => (
          <StarIcon
            key={i}
            width={size}
            height={size}
            className={i < filled ? "is-on" : ""}
          />
        ))}
      </span>
      {showValue && <span className="rating-value">{value.toFixed(1)}</span>}
    </span>
  );
}
