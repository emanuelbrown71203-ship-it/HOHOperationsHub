# HOH Operations Hub

A web app for Heart of House (HOH) operations: **shift handoffs with photos**, **ratings of the previous shift** recorded as **HOH Lead scores**, **kitchen notes**, **checklists**, and a **waste log**. Data is shared live across every device (kitchen tablet, phones, office computer).

Built with React + Vite + TypeScript on a Supabase (Postgres) backend.

## Features

- **Home**: for anyone allowed to see lead scores, the **lead score record comes first** (store average, each HOH Lead's last-30-day score, the latest rating). Then the current shift (AM or PM) with today's day-dot color, the **focus of the week**, **shoutouts** for HOH Leads, the shift handoff status, and pinned kitchen notes.
- **Shift handoff**: the leaving shift uploads photos (required) and optional notes at the shift swap and at close. The incoming shift **rates the previous shift's setup from 1 to 5 stars**, credited to the HOH Lead who ran that shift.
- **Lead Scores**: each HOH Lead's average rating, change versus the previous period, weekly trend against the store average, star breakdown, handoff completion and every comment. Ratings export to CSV. Admins and directors always see scores; an admin can also open them to HOH Leads or everyone in Setup → Store.
- **Kitchen notes**: notes on any equipment (or the kitchen in general), with an optional photo, pinned on Home until someone marks them fixed.
- **Checklists**: a few required **HOH Lead checklists** checked off in the app (daily or weekly), and **position checklists** where the paper checklist for each position is attached as a photo or PDF.
- **Waste log**: quick-pick items, reasons and units, with summaries and CSV export.
- **Setup** (admins only): store name, shift start times, waste reasons and units, HOH Leads, checklists, positions, equipment, team accounts and who sees lead scores. No code changes needed.
- **Passkey sign-in**: people create an account with just their name and sign in with Face ID, a fingerprint or the device passcode. No email address needed.
- **Shift Lead Schedule**: directors and admins pick who leads each shift (type a new name if they aren't on the list; no account needed). The store tablet selects the scheduled lead by itself and ratings are credited to them.
- **Ratings by category**: the incoming shift gives separate stars for each category (Stocked, Clean, Prepped, Organized by default; edit them in Setup → Store). The lead's score is the average.
- **Lead of the Month and streaks**: last month's top-rated lead (3 rated shifts minimum) shows on Home for everyone; streaks count shifts in a row at 4 stars or better.
- **Monthly Report** (directors and admins): one printable page with scores, handoffs, checklists, waste, equipment and training.
- **Lead points**: every shift earns points for its Shift Lead, and they add up: each daily HOH Lead checklist finished, the handoff submitted, each star of the setup rating, each cleaning job checked off, and the photo of the night's waste. Points rank the leads on Lead Scores, show on each lead's page, the Overview and the Monthly Report, and each item on Home shows what it's worth. Point values are set in Setup → Lead scores.
- **Night waste photos**: waste logged on the closing shift needs a photo (switch in Setup → Waste Log), and the PM card on Home asks for a photo of tonight's waste.
- **Cleaning Hub**: cleaning jobs for the whole HOH, grouped by area. Each repeats every day, week, month or any number of days, belongs to the AM shift, the PM shift or either, and can require a photo. The hub shows what's left today, what's overdue, what's done (with who did it) and what's coming up; each shift's Home card has a Cleaning line. Admins edit jobs in Setup → Cleaning.
- **Coaching Notes** (directors and admins): notes on each HOH Lead (coaching or praise), follow-up dates that show up under Needs attention, and an option to share a note with that lead. Shown on the lead's score page and in the Monthly Report.
- **Photo tasks**: any checklist task can require a photo to check it off.
- **Equipment & Supplies**: a message board, not an equipment tracker. Post "something's broken" or "we need something" (oven mitts, a scraper); it stays up until someone marks it fixed or got it.
- **Phone notifications**: when an admin turns them on (Setup → Store), each kind has its own switch: schedule sent (each lead hears about their own shifts only), a reminder an hour before a shift, a reminder if a handoff isn't submitted 30 minutes after the shift ends, broken/needed posts (to directors and admins), and a lead's shift being rated. A lead needs their own account linked to their name (Setup → HOH Leads) and to turn notifications on in Account; on an iPhone the app must first be added to the Home Screen.
- **Live updates** across devices, **phone and tablet layouts**, and a light or dark theme per device.

## How the app is organized

- **Shift ready first**: everyone's Home opens on today's AM and PM requirements side by side (rate the last shift's setup, that shift's checklists, handoff photos and notes), with the current shift highlighted and anything left from an earlier shift marked "Not finished". For HOH Leads, team members and the store tablet the phone tab bar is Home, Checklists, Handoff, Kitchen (equipment & supplies, waste) and More.
- **Managing** (directors and admins): a switch on Home opens the **Overview**: the lead score record, a "Needs attention" list (unscheduled shifts, broken equipment and supply requests, coaching follow-ups, handoffs not submitted, shifts not rated, low scores, accounts waiting for approval) and today shift by shift. The phone tab bar is Home, Scores, Schedule, Kitchen and More.
- The menu is grouped (Performance, Team, Run the shift, Kitchen, Admin), in the order that fits the person's role.
- **Setup** tabs: Store, People, HOH Leads, Lead scores, Checklists, Cleaning, Positions, Waste Log.
- **Feels like the owner's other apps** (see `docs/house-style.md`): pull down to refresh, pop-ups slide up from the bottom with a handle, Undo after everyday changes, count badges on the tab bar, folded detail, a celebration when a list is cleared (switch it off in Account), and the version number in Account.

## Lead scores: how a rating is credited

1. When the shared kitchen device picks the **Shift Lead**, the app records that lead as running the shift. (A lead who submits the handoff from their own linked account is recorded too.)
2. The incoming shift rates the setup they walked into. The rating counts for the recorded Shift Lead. If no lead was recorded, the person rating picks one from the HOH Leads list.
3. Leads can't rate their own shift, and a rating can only be changed by the person who made it or by a lead, director or admin.
4. Directors and admins can move a rating to the correct lead or delete it from the lead's score page.

The record lives in the `shift_ratings` table, with two read-only views for browsing in the Supabase Table Editor: `lead_rating_history` (one row per rating) and `lead_scores` (one row per lead).

## Who gets credit for an entry

| Signed in as | Entries are credited to |
| --- | --- |
| **Shared Kitchen Device** account (the store tablet) | The **Shift Lead** picked from the HOH Leads list at the top of the screen. The device asks again whenever the shift changes or a new day starts. |
| A personal account (Team Member, HOH Lead, Director) | That person's own name |

The database fills in the name itself, so it can't be faked or edited afterward.

## Roles

| Role | Can do |
| --- | --- |
| Pending | Nothing yet. New sign-ups wait here until an admin approves them. |
| Team Member | Checklists, handoffs, rating the previous shift, kitchen notes, waste log |
| HOH Lead | All of the above, plus the focus of the week, shoutouts, and fixing other people's entries |
| Director | All of the above, plus the **lead score record** (always visible) and moving or deleting ratings |
| Shared Kitchen Device | Same as Team Member, but credits the selected Shift Lead |

**Admin** is a switch on top of any role (Setup → People). Admins configure the app: everything in **Setup**, team accounts (approve, change roles, sign-in codes, delete accounts) and who can see lead scores. A Director without the Admin switch can't change the setup. There is always at least one admin, and the very first account becomes Director + Admin automatically.

## First-time setup (do this once)

1. **Passkeys are switched on** in Supabase (Authentication → Passkeys), with `hoh-operations-hub.vercel.app` as the passkey address.
2. **Create your account first** (just your name, then save a passkey). The very first account becomes **Director + Admin** automatically.
3. **Add your HOH Leads** in **Setup → HOH Leads**.
4. **Create the store tablet's login.** On the tablet, create an account named something like "Store Kitchen" and save a passkey, then set its role to **Shared Kitchen Device** in **Setup → People**.
5. **Approve everyone else** in **Setup → People** as they sign up, and switch on **Admin** for anyone else who should configure the app.
6. Edit the starter checklists, equipment and waste items in **Setup** to match your kitchen.

For a lost or new phone, an admin makes a one-time **sign-in code** in Setup → People; the person enters it on the new device and saves a new passkey there. Signing in with an email and password still works for accounts that have one.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

The Supabase URL and publishable key are built in (they're meant to be public; row-level security protects the data). To point at a different project, copy `.env.example` to `.env` and change the values.

## Hosting

The live app: **https://hoh-operations-hub.vercel.app** (Vercel project `hoh-operations-hub`, built from this repository).


`npm run build` produces a static site in `dist/` that works on any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages). It uses hash routing (`/#/waste`), so no server rewrites are needed.

## Database

The schema lives in `supabase/migrations/` and has already been applied to the `hoh-operations-hub` Supabase project:

- `0001_initial_schema.sql`: tables, roles, attribution triggers, row-level security
- `0002_starter_data.sql`: starter checklists, equipment and waste items
- `0003_lock_down_functions.sql`: removes public access to internal functions
- `0004_realtime_setup_tables.sql`: live updates for the setup lists
- `0005_shifts_handoffs_notes.sql`: store settings, AM/PM shifts, focus of the week, shoutouts, shift handoffs with photos, position checklists, file storage
- `0006_lead_scores.sql`: shift ratings credited to HOH Leads, score visibility, linked lead accounts, score views
- `0007_only_directors_move_rated_shifts.sql`: only directors can move a rated shift to a different lead
- `0008_drop_old_rating_columns.sql`: removes two unused rating columns from `shift_handoffs` (run once in the Supabase SQL Editor)
- `0009_signin_codes.sql`: one-time sign-in codes for setting up a passkey on a new device
- `0010_admins.sql`: the Admin switch; only admins change Setup, team accounts and who sees lead scores
- `0011_schedule_categories_fryers_training_push.sql`: Shift Lead schedule, ratings by category, Lead of the Month, photo tasks, Who's Trained, notification subscriptions
- `0012_shift_reminder_job.sql`: the every-10-minutes job that sends shift reminders (notification keys live in `private.push_config`, never in this repository)
- `0013_supplies_coaching_more_notifications.sql`: Equipment & Supplies board, Coaching Notes, more notification types and their switches
- `0014_cleaning_hub.sql`: Cleaning Hub jobs and check-offs, with starter jobs
- `0015_points_and_waste_photos.sql`: lead points per shift, point values, and photos on waste entries (required at close)

Edge functions:

- `supabase/functions/account`: creates passkey accounts, redeems and makes sign-in codes, and lets admins see how people sign in, remove lost passkeys and delete accounts (Setup → People)
- `supabase/functions/notify`: sends phone notifications (schedule posted, shift reminders, test)
- `supabase/functions/set-password`: lets admins set a temporary password for someone who signs in with email (Setup → People)
