-- Tracewire migration 002: per-wireframe codes and unique titles.
-- Run once, after schema.sql.

begin;

-- ---------- 1. unique titles per owner ----------
with ranked as (
  select id,
         row_number() over (partition by station_id, lower(btrim(title)) order by created_at, id) as rn
  from public.wireframes
)
update public.wireframes w
set title = left(btrim(w.title), 108) || ' (' || r.rn || ')'
from ranked r
where r.id = w.id and r.rn > 1;

create unique index wireframes_station_title_key
  on public.wireframes (station_id, lower(btrim(title)));

-- ---------- 2. per-wireframe codes ----------
alter table public.wireframes add column code text;

create or replace function public.make_wireframe_code() returns text
language plpgsql set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text;
  i int;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
    result := 'TW-';
    for i in 0..9 loop
      if i = 5 then result := result || '-'; end if;
      result := result || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.wireframes where code = result);
  end loop;
  return result;
end $$;

update public.wireframes set code = public.make_wireframe_code() where code is null;
alter table public.wireframes alter column code set not null;
alter table public.wireframes add constraint wireframes_code_key unique (code);

-- the server always chooses the code on insert
create or replace function public.wireframes_set_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.code := public.make_wireframe_code();
  return new;
end $$;

create trigger wireframes_code_insert before insert on public.wireframes
  for each row execute function public.wireframes_set_code();

revoke all on function public.make_wireframe_code(), public.wireframes_set_code()
  from public, anon, authenticated;

-- the code can only change through regenerate_wireframe_code()
revoke update on public.wireframes from authenticated;
grant update (title, view_x, view_y, view_zoom) on public.wireframes to authenticated;

-- ---------- 3. per-wireframe access ----------
create table public.wireframe_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, wireframe_id)
);
create index on public.wireframe_access (wireframe_id);

alter table public.wireframe_access enable row level security;
create policy wa_select on public.wireframe_access for select to authenticated
  using (user_id = auth.uid());
create policy wa_delete on public.wireframe_access for delete to authenticated
  using (user_id = auth.uid());
grant select, delete on public.wireframe_access to authenticated;

create or replace function public.can_read_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.wireframes w
           join public.stations s on s.id = w.station_id
           where w.id = wid and s.owner_id = auth.uid())
      or exists (
           select 1 from public.wireframe_access a
           where a.wireframe_id = wid and a.user_id = auth.uid());
$$;

-- a station is readable by its owner, or by someone who joined one of its wireframes
create or replace function public.can_read_station(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stations s where s.id = sid and s.owner_id = auth.uid())
      or exists (
           select 1 from public.wireframe_access a
           join public.wireframes w on w.id = a.wireframe_id
           where w.station_id = sid and a.user_id = auth.uid());
$$;

create or replace function public.join_wireframe(p_code text) returns public.wireframes
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wf public.wireframes;
  clean text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into wf from public.wireframes where code = clean;
  if not found then raise exception 'code_not_found'; end if;
  if not public.owns_station(wf.station_id) then
    insert into public.wireframe_access (user_id, wireframe_id) values (uid, wf.id)
      on conflict do nothing;
  end if;
  return wf;
end $$;

create or replace function public.regenerate_wireframe_code(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if not exists (
    select 1 from public.wireframes w
    where w.id = p_id and public.owns_station(w.station_id)
  ) then
    raise exception 'not_allowed';
  end if;
  new_code := public.make_wireframe_code();
  update public.wireframes set code = new_code where id = p_id;
  delete from public.wireframe_access where wireframe_id = p_id;
  return new_code;
end $$;

revoke all on function public.can_read_wireframe(uuid), public.join_wireframe(text),
  public.regenerate_wireframe_code(uuid) from public, anon;
grant execute on function public.can_read_wireframe(uuid), public.join_wireframe(text),
  public.regenerate_wireframe_code(uuid) to authenticated;

-- ---------- 4. policies now follow the wireframe ----------
drop policy wireframes_select on public.wireframes;
drop policy screens_select on public.screens;
drop policy links_select on public.links;
drop policy issues_select on public.issues;
drop policy issues_insert on public.issues;

create policy wireframes_select on public.wireframes for select to authenticated
  using (public.can_read_wireframe(id));
create policy screens_select on public.screens for select to authenticated
  using (public.can_read_wireframe(wireframe_id));
create policy links_select on public.links for select to authenticated
  using (public.can_read_wireframe(wireframe_id));
create policy issues_select on public.issues for select to authenticated
  using (public.can_read_wireframe(wireframe_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (
    public.can_read_wireframe(wireframe_id)
    and author_id = auth.uid()
    and exists (select 1 from public.wireframes w where w.id = wireframe_id and w.station_id = issues.station_id)
  );

-- storage path is stationId/wireframeId/file, so reads follow the wireframe folder
drop policy screens_read on storage.objects;
create policy screens_read on storage.objects for select to authenticated
  using (bucket_id = 'screens' and public.can_read_wireframe(((storage.foldername(name))[2])::uuid));

-- ---------- 5. remove the old station-wide sharing ----------
drop function if exists public.join_station(text);
drop table if exists public.station_access;

commit;