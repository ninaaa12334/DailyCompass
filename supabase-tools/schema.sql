-- Day Compass: accounts that work from anywhere (paste this whole file into Supabase → SQL Editor → Run).
-- Each person's planner is one row, readable and writable only by that person (row level security).

create table if not exists public.planners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.planners enable row level security;

drop policy if exists "Read own planner" on public.planners;
create policy "Read own planner" on public.planners for select using (auth.uid() = user_id);

-- All writes go through save_planner() below, so no direct insert/update/delete policies are needed.

-- Saves the planner only if nobody else saved since this device last loaded it.
-- Returns the new version, or fails with "conflict" so the app can ask which version to keep.
create or replace function public.save_planner(new_state jsonb, expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  next_version integer;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if octet_length(new_state::text) > 2000000 then raise exception 'planner too large' using errcode = '54000'; end if;
  if expected_version = 0 then
    insert into planners (user_id, state, version) values (me, new_state, 1)
    on conflict (user_id) do nothing;
    if found then return 1; end if;
    raise exception 'conflict' using errcode = '40001';
  end if;
  update planners set state = new_state, version = version + 1, updated_at = now()
   where user_id = me and version = expected_version
   returning version into next_version;
  if next_version is null then raise exception 'conflict' using errcode = '40001'; end if;
  return next_version;
end;
$$;

-- Lets a person delete their own account and planner.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.save_planner(jsonb, integer) from public, anon;
grant execute on function public.save_planner(jsonb, integer) to authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
