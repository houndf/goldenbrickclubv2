"use client";

import { useActionState, useState } from "react";
import { MLS_CUP_PLAYOFF_ROUNDS } from "@/lib/tournament";
import ui from "@/components/ui.module.css";
import { createTournamentAction, type CreateState } from "./actions";

export function CreateTournamentForm() {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(createTournamentAction, {});
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState("");

  return (
    <form action={formAction} className={ui.form}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.small}`}
          onClick={() => {
            setName(`MLS Cup Playoffs ${new Date().getFullYear()}`);
            setRounds(MLS_CUP_PLAYOFF_ROUNDS.join("\n"));
          }}
        >
          USE MLS CUP PLAYOFFS
        </button>
      </div>
      <div className={ui.field}>
        <label htmlFor="t-name" className={ui.label}>
          Tournament name
        </label>
        <input id="t-name" name="name" className={ui.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. Leagues Cup 2027" />
      </div>
      <div className={ui.field}>
        <label htmlFor="t-trophy" className={ui.label}>
          Trophy name
        </label>
        <input id="t-trophy" name="trophyName" className={ui.input} maxLength={80} placeholder={name ? `${name} Oracle` : "[Tournament] Oracle"} />
      </div>
      <div className={ui.field}>
        <label htmlFor="t-rounds" className={ui.label}>
          Rounds, first to last (one per line). Worth 1, 2, 3… points; the last is the final.
        </label>
        <textarea
          id="t-rounds"
          name="rounds"
          className={ui.input}
          style={{ minHeight: 140, padding: 12, lineHeight: 1.4 }}
          value={rounds}
          onChange={(e) => setRounds(e.target.value)}
          required
        />
      </div>
      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending} style={{ fontSize: 22 }}>
        {pending ? "CREATING…" : "CREATE TOURNAMENT"}
      </button>
    </form>
  );
}
