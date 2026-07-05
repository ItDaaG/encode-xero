-- Run this once in the Supabase SQL editor. Tracks the last known
-- profit/loss status per (customer, organisation), so check_for_losses.py
-- only emails when a business newly becomes loss-making, not on every
-- scheduled check while it remains one.
create table public.loss_alerts (
  user_id uuid not null,
  tenant_id text not null,
  last_status text not null check (last_status in ('profit', 'loss')),
  last_net_profit numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
