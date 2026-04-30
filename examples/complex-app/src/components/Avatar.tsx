type Size = "sm" | "md" | "lg" | "xl";
type Status = "online" | "offline" | "busy" | "away" | "none";

const SIZE: Record<Size, string> = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-9 h-9 text-[13px]",
  lg: "w-14 h-14 text-lg",
  xl: "w-20 h-20 text-2xl",
};

const STATUS_COLOR: Record<Exclude<Status, "none">, string> = {
  online: "bg-green-500",
  offline: "bg-zinc-400",
  busy: "bg-red-500",
  away: "bg-amber-500",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "md",
  status = "none",
  shape = "circle",
}: {
  name: string;
  src?: string;
  size?: Size;
  status?: Status;
  shape?: "circle" | "square";
}) {
  const shapeCls = shape === "circle" ? "rounded-full" : "rounded-md";
  return (
    <span
      className={`relative inline-flex items-center justify-center font-semibold text-white shrink-0 bg-gradient-to-br from-indigo-400 to-fuchsia-400 ${SIZE[size]} ${shapeCls}`}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className={`w-full h-full object-cover ${shapeCls}`}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
      {status !== "none" && (
        <span
          className={`absolute bottom-0 right-0 w-[28%] h-[28%] min-w-[8px] min-h-[8px] rounded-full border-2 border-white dark:border-zinc-900 ${STATUS_COLOR[status]}`}
        />
      )}
    </span>
  );
}
