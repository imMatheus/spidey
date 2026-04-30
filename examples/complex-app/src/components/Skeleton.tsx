type Rounded = "none" | "sm" | "md" | "full";

const ROUND: Record<Rounded, string> = {
  none: "rounded-none",
  sm: "rounded",
  md: "rounded-lg",
  full: "rounded-full",
};

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
      className={`inline-block align-middle bg-[linear-gradient(90deg,#eef0f2_0%,#f7f8fa_50%,#eef0f2_100%)] dark:bg-[linear-gradient(90deg,#27272a_0%,#3f3f46_50%,#27272a_100%)] [background-size:200%_100%] [animation:shimmer_1.4s_ease-in-out_infinite] ${ROUND[rounded]}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className="flex flex-col gap-1.5">
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
