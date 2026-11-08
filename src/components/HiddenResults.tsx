import ui from "./ui.module.css";

/** Shown to players while the commissioner has results hidden. */
export function HiddenResultsCard() {
  return (
    <section className={ui.panel} style={{ alignItems: "center", textAlign: "center", padding: "28px 16px" }}>
      <span style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
        🤫
      </span>
      <h2 className={ui.sectionTitle}>Results are hidden</h2>
      <p className={ui.lead}>The commissioner is keeping the standings under wraps for now. Check back later!</p>
    </section>
  );
}

/** Reminder for admins, who still see everything. */
export function HiddenResultsBanner() {
  return (
    <p className={ui.notice} role="status" style={{ background: "var(--purple)" }}>
      Results are hidden from players right now. You&apos;re seeing them because you&apos;re an admin.
    </p>
  );
}
