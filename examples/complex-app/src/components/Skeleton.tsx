type Rounded = "none" | "sm" | "md" | "full";

export function Skeleton({
  width,
  height = 12,
  rounded = "md",
}: {
  width?: number | string;
  height?: number | string;
  rounded?: Rounded;
}) {
  return (
    <span
      className={`skel skel-r-${rounded}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className="skel-text">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={10}
          width={i === lines - 1 ? "70%" : "100%"}
        />
      ))}
    </span>
  );
}
