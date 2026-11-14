# HOH Operations Hub

A web app for Heart of House (HOH) operations: **shift handoffs with photos**, **ratings of the previous shift** recorded as **HOH Lead scores**, **kitchen notes**, **checklists**, and a **waste log**. Data is shared live across every device (kitchen tablet, phones, office computer).

Built with React + Vite + TypeScript on a Supabase (Postgres) backend.

## Features

- **Home**: the current shift (AM or PM) with today's day-dot color, the **focus of the week**, **shoutouts** for HOH Leads, the shift handoff status, and pinned kitchen notes.
- **Shift handoff**: the leaving shift uploads photos (required) and optional notes at the shift swap and at close. The incoming shift **rates the previous shift's setup from 1 to 5 stars**, credited to the HOH Lead who ran that shift.
- **Lead Scores**: each HOH Lead's average rating, change versus the previous period, weekly trend against the store average, star breakdown, handoff completion and every comment. Ratings export to CSV. Only directors can see scores unless a director changes it in Setup → Store.
- **Kitchen notes**: notes on any equipment (or the kitchen in general), with an optional photo, pinned on Home until someone marks them fixed.
- **Checklists**: a few required **HOH Lead checklists** checked off in the app (daily or weekly), and **position checklists** where the paper checklist for each position is attached as a photo or PDF.
- **Waste log**: quick-pick items, reasons and units, with summaries and CSV export.
- **Setup** (leads and directors): store name, shift start times, waste reasons and units, HOH Leads, checklists, positions, equipment and team accounts. No code changes needed.
- **Live updates** across devices, **phone and tablet layouts**, and a light or dark theme per device.

## Lead scores: how a rating is credited

1. When the shared kitchen device picks the **Shift Lead**, the app records that lead as running the shift. (A lead who submits the handoff from their own linked account is recorded too.)
2. The incoming shift rates the setup they walked into. The rating counts for the recorded Shift Lead. If no lead was recorded, the person rating picks one from the HOH Leads list.
3. Leads can't rate their own shift, and a rating can only be changed by the person who made it or by a lead or director.
4. Directors can move a rating to the correct lead or delete it from the lead's score page.

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
| Pending | Nothing yet. New sign-ups wait here until a director approves them. |
| Team Member | Check off checklists, log waste and equipment, resolve issues |
| HOH Lead | All of the above, plus **Setup** (HOH Leads list, checklists, waste items, equipment) |
| Director | All of the above, plus **Setup → Team** (approve accounts, change roles) |
| Shared Kitchen Device | Same as Team Member, but credits the selected Shift Lead |

## First-time setup (do this once)

1. **Turn off email confirmation, or set up email sending.** Supabase's built-in email service only sends to members of your Supabase team, so team members' confirmation emails won't arrive. Easiest fix: in the Supabase dashboard open project **hoh-operations-hub → Authentication → Sign In / Providers → Email** and turn off **Confirm email**. (Or add your own SMTP under Authentication → Emails.)
2. **Create your account first.** The very first account becomes the **Director** automatically.
3. **Add your HOH Leads** in **Setup → HOH Leads**.
4. **Create the store tablet's login.** Sign up on the tablet with a store email (for example `kitchen@yourstore…`), then as Director set its role to **Shared Kitchen Device** in **Setup → Team**.
5. **Approve everyone else** in **Setup → Team** as they sign up.
6. Edit the starter checklists, equipment and waste items in **Setup** to match your kitchen.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

The Supabase URL and publishable key are built in (they're meant to be public; row-level security protects the data). To point at a different project, copy `.env.example` to `.env` and change the values.

## Hosting

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
