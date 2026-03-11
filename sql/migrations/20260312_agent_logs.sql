-- Migration: add agent_logs table for AI agent conversation tracking
-- Run this manually via the Supabase SQL editor.

create table if not exists agent_logs (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null,
  telegram_id bigint      references telegram_users(telegram_id) on delete set null,
  event_type  text        not null
                check (event_type in (
                  'user_message',
                  'model_request',
                  'tool_call',
                  'tool_result',
                  'model_response',
                  'error'
                )),
  provider    text,
  model       text,
  content     text,
  tool_name   text,
  tool_args   jsonb,
  tokens_in   integer     not null default 0,
  tokens_out  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists agent_logs_session_id_idx  on agent_logs(session_id);
create index if not exists agent_logs_telegram_id_idx on agent_logs(telegram_id);
create index if not exists agent_logs_created_at_idx  on agent_logs(created_at desc);

-- RLS: only service role can insert; admins read via API (service role key bypasses RLS)
alter table agent_logs enable row level security;
