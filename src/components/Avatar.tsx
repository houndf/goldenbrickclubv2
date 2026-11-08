import ui from "./ui.module.css";

/** Initials in a colored circle. Text is dark on every palette color except red. */
export function Avatar({
  initials,
  color = "#3DD6C4",
  size = 44,
}: {
  initials: string;
  color?: string;
  size?: number;
}) {
  const darkBg = color.toLowerCase() === "#d7263d";
  return (
    <span
      className={ui.avatar}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: color,
        color: darkBg ? "var(--cream)" : "var(--ink)",
        borderWidth: size < 32 ? 2 : 3,
      }}
    >
      {initials}
    </span>
  );
}
