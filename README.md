# Golden Brick Club 2.0

The Atlanta United prediction league — rebuilt as a phone-first web app with a
"matchday game show" look.

**Stack:** Next.js (TypeScript) on Vercel · Supabase (Postgres + Auth) · installable as a PWA.

## Status

Milestone 1 (foundation) in progress.

- [x] App skeleton, dark/light design tokens, fonts, PWA manifest
- [x] Welcome screen (sample data)
- [x] Scoring engine for the 2027 pick system, with tests
- [x] Database schema with row-level security
- [x] 2026 history import (old exact-score system)
- [ ] Supabase project connected
- [ ] Login (method TBD)
- [ ] Vercel deployment

## Scoring (2027+)

| Part | Right | Wrong |
|---|---|---|
| Result: home win / draw / away win | +3 (draw +5) | −1 |
| Margin (optional, only pays if the result is right): by 1 / 2 / 3+ | +2 / +3 / +4 | −2 |
| First goal (optional, independent of the result) | +1 | −1 (void if 0–0) |

Tie-breaker: most margin bets won. Values live in `src/lib/scoring/rules.ts`.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # scoring tests
npm run typecheck
npm run build
```

## Database

Migrations live in `supabase/migrations/`. Apply them in the Supabase SQL editor
(or with the Supabase CLI). Key rules enforced by the database:

- Players are tracked by a hidden id, so renaming never detaches history.
- Picks can be made or changed only until a match locks (kickoff + 15 min).
- You can always see your own picks; everyone else's appear once the match locks.
- Players can't make themselves admin or Extra Gold.

### Importing 2026

```bash
npm run import:2026 -- path/to/MLS_Predictions_2026.xlsx
```

Reads the old Google Sheet export (passcodes are never read), writes
`supabase/seed/2026.local.sql`, and prints the 2026 standings so they can be
checked. The seed file contains players' names and picks, so it is gitignored —
run it against the database directly rather than committing it.

`data/2026-schedule.json` is the 2026 fixture list from the original app; times
are US Eastern.
