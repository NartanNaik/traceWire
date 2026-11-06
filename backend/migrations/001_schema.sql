-- Tracewire schema. Run once on a fresh Supabase project.

-- ---------- tables ----------
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  display_name text check (display_name is null or char_length(display_name) <= 40),
  created_at timestamptz not null default now()
);

create table public.station_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);

create table public.wireframes (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  view_x double precision not null default 0,
  view_y double precision not null default 0,
  view_zoom double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.screens (
  id uuid primary key default gen_random_uuid(),
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  name text not null default 'Page' check (char_length(name) <= 60),
  image_path text not null,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null,
  h double precision not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  from_screen uuid not null references public.screens(id) on delete cascade,
  from_x double precision not null,
  from_y double precision not null,
  to_screen uuid not null references public.screens(id) on delete cascade,
  to_x double precision not null,
  to_y double precision not null,
  created_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  screen_id uuid not null references public.screens(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  title text not null check (char_length(title) between 1 and 140),
  details text not null default '' check (char_length(details) <= 4000),
  fix text not null default '' check (char_length(fix) <= 4000),
  pin_x double precision not null,
  pin_y double precision not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index on public.station_access (station_id);
create index on public.wireframes (station_id);
create index on public.screens (wireframe_id);
create index on public.screens (station_id);
create index on public.links (wireframe_id);
create index on public.links (from_screen);
create index on public.links (to_screen);
create index on public.issues (wireframe_id);
create index on public.issues (screen_id);
create index on public.issues (station_id);

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger wireframes_touch before update on public.wireframes
  for each row execute function public.set_updated_at();

create or replace function public.owns_station(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stations s where s.id = sid and s.owner_id = auth.uid());
$$;

create or replace function public.can_read_station(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stations s where s.id = sid and s.owner_id = auth.uid())
      or exists (select 1 from public.station_access a where a.station_id = sid and a.user_id = auth.uid());
$$;

create or replace function public.make_station_code() returns text
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
    exit when not exists (select 1 from public.stations where code = result);
  end loop;
  return result;
end $$;

create or replace function public.ensure_station() returns public.stations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  st public.stations;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  insert into public.stations (owner_id, code)
    values (uid, public.make_station_code())
    on conflict (owner_id) do nothing;
  select * into st from public.stations where owner_id = uid;
  return st;
end $$;

create or replace function public.join_station(p_code text) returns public.stations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  st public.stations;
  clean text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into st from public.stations where code = clean;
  if not found then raise exception 'code_not_found'; end if;
  if st.owner_id <> uid then
    insert into public.station_access (user_id, station_id) values (uid, st.id)
      on conflict do nothing;
  end if;
  return st;
end $$;

revoke all on function public.owns_station(uuid), public.can_read_station(uuid),
  public.make_station_code(), public.ensure_station(), public.join_station(text) from public, anon;
grant execute on function public.owns_station(uuid), public.can_read_station(uuid),
  public.ensure_station(), public.join_station(text) to authenticated;

-- ---------- row level security ----------
alter table public.stations enable row level security;
alter table public.station_access enable row level security;
alter table public.wireframes enable row level security;
alter table public.screens enable row level security;
alter table public.links enable row level security;
alter table public.issues enable row level security;

create policy stations_select on public.stations for select to authenticated
  using (public.can_read_station(id));
create policy stations_update on public.stations for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy access_select on public.station_access for select to authenticated
  using (user_id = auth.uid());
create policy access_delete on public.station_access for delete to authenticated
  using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['wireframes', 'screens', 'links'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_station(station_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.owns_station(station_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.owns_station(station_id)) with check (public.owns_station(station_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.owns_station(station_id))', t || '_delete', t);
  end loop;
end $$;

create policy issues_select on public.issues for select to authenticated
  using (public.can_read_station(station_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (
    public.can_read_station(station_id)
    and author_id = auth.uid()
    and exists (select 1 from public.wireframes w where w.id = wireframe_id and w.station_id = issues.station_id)
  );
create policy issues_update on public.issues for update to authenticated
  using (author_id = auth.uid() or public.owns_station(station_id))
  with check (author_id = auth.uid() or public.owns_station(station_id));
create policy issues_delete on public.issues for delete to authenticated
  using (author_id = auth.uid() or public.owns_station(station_id));

grant select, insert, update, delete on public.stations, public.station_access,
  public.wireframes, public.screens, public.links, public.issues to authenticated;

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['issues', 'screens', 'links'] loop
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screens', 'screens', false, 10485760, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy screens_read on storage.objects for select to authenticated
  using (bucket_id = 'screens' and public.can_read_station(((storage.foldername(name))[1])::uuid));
create policy screens_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'screens' and public.owns_station(((storage.foldername(name))[1])::uuid));
create policy screens_delete on storage.objects for delete to authenticated
  using (bucket_id = 'screens' and public.owns_station(((storage.foldername(name))[1])::uuid));