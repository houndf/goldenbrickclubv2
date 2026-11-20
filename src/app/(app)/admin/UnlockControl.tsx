import ui from "@/components/ui.module.css";

export type UnlockMode = "off" | "on" | "retro";

const OPTIONS: { mode: UnlockMode; label: string; hint: string }[] = [
  { mode: "off", label: "NORMAL", hint: "Normal locks" },
  { mode: "on", label: "UNLOCK", hint: "Unlock picks that don't have a result yet" },
  { mode: "retro", label: "+ PAST", hint: "Also unlock games that already have a result" },
];

/** Three-way switch: normal locks / unlocked / unlocked including decided games. */
export function UnlockControl({
  action,
  current,
  label,
  fields = {},
}: {
  action: (form: FormData) => Promise<void>;
  current: UnlockMode;
  label: string;
  fields?: Record<string, string>;
}) {
  return (
    <form action={action} role="radiogroup" aria-label={label} style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="submit"
          name="mode"
          value={o.mode}
          role="radio"
          aria-checked={current === o.mode}
          title={o.hint}
          className={`${ui.button} ${ui.small} ${current === o.mode ? ui.primary : ui.secondary}`}
        >
          {o.label}
          {current === o.mode && o.mode !== "off" ? " 🔓" : ""}
        </button>
      ))}
    </form>
  );
}

export const unlockModeOf = (on: boolean, retro: boolean): UnlockMode => (!on ? "off" : retro ? "retro" : "on");
