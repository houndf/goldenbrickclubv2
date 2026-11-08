import ui from "@/components/ui.module.css";

export const metadata = { title: "Pick · Golden Brick Club" };

export default function PickPage() {
  return (
    <main className={ui.screen}>
      <h1 className={ui.bigTitle}>
        CALL THE
        <br />
        SCORE!
      </h1>
      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>No match to pick yet</h2>
        <p className={ui.lead}>
          The 2026 season is over. Picks open here as soon as the 2027 schedule is out: call the result, double down on
          the margin, and bet on the first goal.
        </p>
      </section>
    </main>
  );
}
