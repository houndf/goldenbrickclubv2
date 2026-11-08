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
- [x] Invite-only accounts: username + password, no email
- [x] Login, logout, change password
- [x] Admin portal: invite codes, password resets, admin / Extra Gold
- [ ] Supabase project connected
- [ ] Vercel deployment

## Scoring (2027+)

| Part | Right | Wrong |
|---|---|---|
| Result: home win / draw / away win | +3 (draw +5) | −1 |
| Margin (optional, only pays if the result is right): by 1 / 2 / 3+ | +2 / +3 / +4 | −2 |
| First goal (optional, independent of the result) | +1 | −1 (void if 0–0) |

Tie-breaker: most margin bets won. Values live in `src/lib/scoring/rules.ts`.

## Tournaments (Cups)

Separate from the season. Round-by-round: when a round's matchups are set,
everyone picks who advances. Each correct pick scores the round's points
(1, 2, 3, …); wrong or missed picks score 0. The final also takes a
total-goals guess that breaks ties for the **[Tournament] Oracle** trophy.
Winners get a 🔮 badge. The Cup tab shows only while a tournament is live.
Admins run everything from `/admin/cup`.

## Setup

1. **Database:** in the Supabase SQL editor, run each file in `supabase/migrations/` in order.
2. **2026 history + invites:** run `npm run import:2026 -- <xlsx>` and paste the generated
   `supabase/seed/2026.local.sql` into the SQL editor. It ends by listing one invite code per
   2026 player (with their old admin / Extra Gold status).
3. **Supabase Auth settings:** turn **off** "Allow new users to sign up" (Authentication → Sign In / Providers).
   Accounts are only created through invite codes by the server.
4. **Vercel environment variables** (Settings → Environment Variables), then redeploy:

   | Name | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Connect (Project URL) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase → Settings → API Keys → secret key (**server only, never share**) |

   Optional: `PLAYER_EMAIL_DOMAIN` — the domain used for players' hidden placeholder email
   addresses (default `players.goldenbrickclub.invalid`). Players never see or use it.

## Accounts

- Invite-only: the commissioner makes one-use codes in `/admin` and sends players a
  `/join?code=…` link. A code can be linked to a 2026 player to reconnect their history.
- Players log in with username + password. Usernames are case-insensitive.
- No email: Supabase needs one internally, so each account gets a private placeholder
  address that never receives mail.
- Forgot password → the commissioner resets it in `/admin` and gets a temporary
  password to send privately; the player changes it in their profile.

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
