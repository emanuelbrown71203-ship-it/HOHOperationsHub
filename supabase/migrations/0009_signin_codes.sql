-- One-time sign-in codes: a director creates one so someone can set up a passkey on a new
-- device (a replaced store tablet, a new phone). Codes are stored hashed and expire in 24 hours.
-- Only the `account` edge function (service role) reads or writes this table.
create table public.signin_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz
);
create index on public.signin_codes (user_id);
alter table public.signin_codes enable row level security;
revoke all on public.signin_codes from anon, authenticated;
