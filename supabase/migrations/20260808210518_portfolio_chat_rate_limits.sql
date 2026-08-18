create schema if not exists private;

create table if not exists private.portfolio_chat_rate_limits (
  conversation_hash text primary key,
  window_start timestamptz not null,
  window_count integer not null default 0,
  day_start date not null,
  day_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table private.portfolio_chat_rate_limits enable row level security;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.portfolio_chat_rate_limits to service_role;

create or replace function public.portfolio_chat_bump_rate_limit(
  p_conversation_hash text,
  p_now timestamptz default now(),
  p_window_limit integer default 12,
  p_day_limit integer default 60,
  p_strict boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  rec private.portfolio_chat_rate_limits%rowtype;
  effective_window integer := case when p_strict then least(p_window_limit, 4) else p_window_limit end;
  effective_day integer := case when p_strict then least(p_day_limit, 20) else p_day_limit end;
  current_day date := (p_now at time zone 'utc')::date;
  retry_after integer := 0;
begin
  if p_conversation_hash is null or length(p_conversation_hash) < 24 then
    return jsonb_build_object('allowed', false, 'retryAfter', 300);
  end if;

  insert into private.portfolio_chat_rate_limits (
    conversation_hash,
    window_start,
    window_count,
    day_start,
    day_count,
    updated_at
  )
  values (
    p_conversation_hash,
    p_now,
    0,
    current_day,
    0,
    p_now
  )
  on conflict (conversation_hash) do nothing;

  select *
  into rec
  from private.portfolio_chat_rate_limits
  where conversation_hash = p_conversation_hash
  for update;

  if rec.window_start <= p_now - interval '5 minutes' then
    rec.window_start := p_now;
    rec.window_count := 0;
  end if;

  if rec.day_start <> current_day then
    rec.day_start := current_day;
    rec.day_count := 0;
  end if;

  if rec.window_count >= effective_window then
    retry_after := greatest(1, extract(epoch from (rec.window_start + interval '5 minutes' - p_now))::integer);
    update private.portfolio_chat_rate_limits
    set window_start = rec.window_start,
        window_count = rec.window_count,
        day_start = rec.day_start,
        day_count = rec.day_count,
        updated_at = p_now
    where conversation_hash = p_conversation_hash;

    return jsonb_build_object('allowed', false, 'retryAfter', retry_after, 'scope', 'window');
  end if;

  if rec.day_count >= effective_day then
    update private.portfolio_chat_rate_limits
    set window_start = rec.window_start,
        window_count = rec.window_count,
        day_start = rec.day_start,
        day_count = rec.day_count,
        updated_at = p_now
    where conversation_hash = p_conversation_hash;

    return jsonb_build_object('allowed', false, 'retryAfter', 3600, 'scope', 'day');
  end if;

  update private.portfolio_chat_rate_limits
  set window_start = rec.window_start,
      window_count = rec.window_count + 1,
      day_start = rec.day_start,
      day_count = rec.day_count + 1,
      updated_at = p_now
  where conversation_hash = p_conversation_hash;

  return jsonb_build_object(
    'allowed', true,
    'windowCount', rec.window_count + 1,
    'dayCount', rec.day_count + 1
  );
end;
$$;

revoke all on function public.portfolio_chat_bump_rate_limit(text, timestamptz, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.portfolio_chat_bump_rate_limit(text, timestamptz, integer, integer, boolean) to service_role;
