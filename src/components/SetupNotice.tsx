import ui from "./ui.module.css";

/** Shown instead of forms until the Supabase settings are added to Vercel. */
export function SetupNotice() {
  return (
    <p className={ui.notice} role="status">
      Almost ready: the database connection hasn&apos;t been set up yet.
    </p>
  );
}
