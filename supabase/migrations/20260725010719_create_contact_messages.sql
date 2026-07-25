create extension if not exists pgcrypto with schema extensions;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  email text not null check (
    email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  message text not null check (char_length(trim(message)) between 1 and 1200),
  source text not null default 'portfolio-contact',
  page text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  email_sent boolean not null default false,
  email_error text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.contact_messages enable row level security;

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status);

comment on table public.contact_messages is
  'Messages submitted from Ranbir Kumar portfolio contact form.';

comment on column public.contact_messages.status is
  'Manual triage status for the portfolio inbox.';
