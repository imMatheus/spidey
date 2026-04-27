type Size = "sm" | "md" | "lg" | "xl";
type Status = "online" | "offline" | "busy" | "away" | "none";

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
  return (
    <span className={`avatar avatar-${size} avatar-${shape}`} title={name}>
      {src ? (
        <img src={src} alt={name} />
      ) : (
        <span className="avatar-initials">{initials(name)}</span>
      )}
      {status !== "none" && (
        <span className={`avatar-status status-${status}`} />
      )}
    </span>
  );
}
