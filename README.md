# HOH Operations Hub

A web app for Heart of House (HOH) operations: **shift checklists**, a **waste log**, and an **equipment log**. Data is shared live across every device (kitchen tablet, phones, office computer).

Built with React + Vite + TypeScript on a Supabase (Postgres) backend.

## Features

- **Shift checklists**: Opening, Mid-Shift, Closing and Weekly Deep Clean lists (all editable). Tap to check off; each item shows who did it and when. You can look back at past days.
- **Waste log**: quick-pick items, quantity, unit and reason. Shows daily, 7-day and 30-day summaries by item and reason, plus CSV export.
- **Equipment log**: log filter changes, oil changes, cleaning and maintenance, or report an issue. Open issues stay at the top until someone resolves them. The Home screen shows how long since each fryer was filtered. CSV export.
- **Live updates**: when something is checked or logged on one device, every other device updates within seconds.
- **Phone and tablet layouts**: bottom tabs on phones, sidebar on tablets and computers. Can be added to the home screen as an app.

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
