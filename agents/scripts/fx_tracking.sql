-- Run this once in the Supabase SQL editor.

-- Historical exchange-rate log, built up over time by check_for_losses.py --
-- the free rate API only gives the *current* rate, so "is now a good time
-- to transfer money" needs our own history to compare against.
create table public.fx_rate_snapshots (
  id bigint generated always as identity primary key,
  base_currency text not null,
  target_currency text not null,
  rate numeric not null,
  recorded_at timestamptz not null default now()
);
create index fx_rate_snapshots_lookup on public.fx_rate_snapshots (base_currency, target_currency, recorded_at);

-- Tracks whether we've already sent an "FX timing" alert for this org so we
-- notify once when a good window opens, not every single check.
alter table public.loss_alerts add column last_fx_status text;
