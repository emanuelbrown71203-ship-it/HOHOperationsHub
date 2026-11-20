# HOH Operations Hub: notes for Claude

A web app for Heart of House (HOH, the kitchen) operations at one Chick-fil-A store. Used on a shared kitchen
tablet and on phones. Live at **https://hoh-operations-hub.vercel.app**. README.md describes the features;
this file is how to work on it.

## Read this first: the house style

**`docs/house-style.md` is the owner's standing list of how all their apps look, feel and behave** (copied
from their Passbook app; it covers Tasks for Two, Roux, the YouTube Dashboard, this app and Passbook). Follow
it for every screen. Already in this app: bottom tab bar + More sheet, side menu on wide screens, sheets with
a drag handle (`Modal`), pull to refresh (`PullToRefresh`, screens reload through `useRealtime`), Undo
messages (`toast(text, 'ok', { undo })`), folds (`Fold`), celebrations (`celebrate()`, switchable in
Account), count badges, press-in on tap, version number in Account (bump `package.json` version: small fix
x.y.z+1, new feature x.y+1). Where the house style and this app differ, this app's existing look wins (for
example the theme defaults to light because the owner prefers bright).

## Who you're working with

- The owner runs HOH at the store. They are **not a developer**: explain in plain language, describe what
  changed on screen, never ask them to edit code or run commands.
- **Everything must be configurable in the app.** If a setting would need a code change, put it in Setup.
- Labels must say what a thing does ("Equipment & Supplies", not "Notes"). The owner wants to understand what
  they are tapping before they tap it.
- They prefer a bright, colorful look (not dark). Phone and tablet both matter.
- Keep personal details out of the repository, commits and outside services. No passwords in files.

## Roles (the core of most changes)

| Who | Role / flag | What they get |
| --- | --- | --- |
| Store tablet | `kitchen` | Shift view; entries credited to the Shift Lead picked on the device |
| HOH Lead | `lead` | Shift view; focus of the week, shoutouts, fixing others' entries (`is_manager()`) |
| Team member | `team_member` | Shift view |
| Director | `director` | Always sees lead scores, moves/deletes ratings, builds the schedule, writes Coaching Notes (`can_schedule()`) |
| Admin | `is_admin` flag on any role | Setup, team accounts, who sees scores. Always at least one admin. |
| New sign-up | `pending` | Waiting screen until an admin approves |

The first account ever created becomes Director + Admin. **Admins can preview any role** (Account → View the app as…, `ViewAsCard` / `PreviewBanner` in
`src/components/ViewAs.tsx`): `app.tsx` swaps the role in `profile` (`realProfile` keeps the real one), and
`ensureActor()` refuses every write while previewing. As a safety net, `src/lib/supabase.ts` also refuses
every save, upload and server-function call during a preview; a new database function that only reads must be
added to `READ_ONLY_FUNCTIONS` there, or it fails in previews. **Home opens "shift ready" for everyone**: the AM and
PM requirements side by side (rate the last shift, that shift's checklists, that shift's cleaning, handoff photos). Directors and
admins can switch to the **Overview** (scores, needs attention); the choice is remembered per device.
The owner does **not** want to track equipment: no equipment list, no fryer logs. "Equipment & Supplies" is
only a message board (something broken / something needed, like oven mitts). The **Cleaning Hub** is
cleaning jobs for the whole HOH: each repeats every N days, belongs to an area and a shift (or any shift),
can require a photo; due/overdue is worked out in `src/lib/useCleaning.ts`; admins edit jobs in Setup → Cleaning.
**Lead points** add up per Shift Lead: the database function `lead_points_by_shift` says what each shift got
done (finished daily checklists, handoff, rating stars, cleaning jobs, night waste photo) and the app
multiplies by `app_settings.point_values` (Setup → Lead scores), so changing a value recounts history.
Waste logged on the closing shift needs a photo (`waste_photo_at_close`, Setup → Waste Log).
The **Leaderboard** (everyone can see it) shows only the top 5 by points for the week or month and **never
last place or anyone's breakdown**: the owner doesn't want it to be a humiliation ritual. `leaderboard()` and
`my_points()` (private "N more puts you on the board", personal accounts only, never on the store tablet). Menu, phone tabs and More page all come
from `src/lib/nav.ts`; change navigation there, not in Layout.

## Code map

- React 18 + Vite + TypeScript, plain CSS (`src/styles.css`, tokens on `:root`, light/dark/auto via
  `data-app-theme`). HashRouter (`/#/route`).
- `src/lib/app.tsx`: app context (session, profile, roles, shift, Shift Lead, settings, toasts).
- `src/lib/demo.ts`: in-browser fake database for the demo build. It mirrors the real permission rules;
  update it when you change rules, or the demo drifts (it is currently behind the live app).
- `src/pages/*`: one file per screen. `Setup.tsx` holds every admin editor.
- Charts follow the dataviz skill (validated palette, meters, words not color alone).

## Database (Supabase project `khtuqripoqqlzqdkrwym`)

- Schema in `supabase/migrations/` (0001-0016). Apply new ones with the Supabase `apply_migration` tool and
  also commit the file. **0008 has not been applied**; the owner was asked to run it in the SQL editor.
- Row-level security on every table. Names on entries are filled in by the database (attribution triggers,
  `actor_name()`), never sent by the app. Write rules for who can do what in SQL policies/functions, then
  mirror them in the UI and in `demo.ts`.
- **Never work around the Supabase confirmation for destructive SQL** (DROP, DELETE of real data, deleting
  accounts the owner didn't ask about). Prefer `ALTER POLICY` / `CREATE OR REPLACE` / `ADD COLUMN` in
  migrations; if something destructive is needed, ask the owner first or give them the SQL to paste.
- Edge functions in `supabase/functions/` (deploy with the Supabase tool, `verify_jwt: false`; each checks
  the caller itself):
  - `account`: passkey sign-up, sign-in codes, team view, remove passkeys, delete account (admins).
  - `set-password`: admins set a temporary password for email accounts.
  - `notify`: phone notifications: schedule sent, reminder an hour before a shift, handoff not submitted
    30 minutes after a shift ends, new broken/needed post (to directors and admins), shift rated (to its
    lead). Each kind has a switch in Setup → Store (`app_settings.notify_kinds`). A database cron job calls it
    every 10 minutes; database triggers call it for new posts and ratings (`private.call_notify`). Signing keys live in `private.push_config` (never in the repo); the public
    key is in `src/lib/push.ts`.

## Checking your work

1. `npm run build` (type-checks too). `npm run build:demo` if you touched `demo.ts`. Bump the version in
   `package.json` (shown in Account).
2. Talk to the real database from Node with `NODE_USE_ENV_PROXY=1` (the sandbox needs its proxy).
3. Screens on real data, phone and tablet, no deploy needed:
   `HOH_EMAIL=… HOH_PASSWORD=… [HOH_THEME=dark] node scripts/check-screens.cjs <out-folder> [/route …]`
   (the house style asks for light and dark).
   It serves `dist/` under the live address, so passkeys behave as in production. For passkey flows, add
   Chrome's virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`) to the same setup.
4. Test accounts (example.com emails, names start with "Test" / "Zz Test"): Test Director, Test Member,
   Store Kitchen. Passwords are not stored here; an admin can reset one with `set-password`. To test admin
   screens, temporarily set `is_admin = true` on Test Director **and set it back afterwards**.
5. Look at the screenshots yourself, and check for sideways scrolling at phone width.

## Publishing

- Work on branch `claude/dazzling-darwin-2jdnrd`; commit and push there.
- Deploy with the Vercel tool `create_deployment`: team `team_Z3WkabKZtiSOMv6ZWul3P1AG`, project
  `prj_tapY3if1CUW3aH1zLIFNsJrQANs7`, `target: production`, gitSource github
  `emanuelbrown71203-ship-it/HOHOperationsHub` at the pushed commit. Then confirm `READY` with `get_deployment`.
- This sandbox can't open vercel.app directly; use Vercel's `web_fetch_vercel_url` to check the live page.
- The shareable demo (claude.ai artifact) is built with `npm run build:demo` and is behind the live app.

## Open items

- Sample data labeled "(test)" and five test accounts are in the live database. Remove them only when the
  owner says so (they were offered a one-step cleanup).
- Notifications haven't been confirmed on a real phone yet (owner to tap "Send a test" in Account).
- No HOH Lead test account exists, so "You lead next", "Your lead score" and "Notes for you" on Home haven't
  been seen on screen.
- Unused but kept (no history lost, no destructive SQL): `equipment`, `equipment_logs` (old fryer logs and
  issues; open/recent issues were copied into `kitchen_requests`), `team_members`, `position_signoffs`.
