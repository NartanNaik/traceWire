-- Tracewire migration 007: platform administrator. Run once, after 006.
begin;

-- ===== who is an administrator (no client can read or change this table) =====
create table public.platform_admins (
  email text primary key check (email = lower(btrim(email)))
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

insert into public.platform_admins (email) values ('naiknartana@gmail.com') on conflict do nothing;

-- confirmed email on a passwordless account only (stops password pre-registration of the address)
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.platform_admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and coalesce(u.encrypted_password, '') = ''
  );
$$;

-- ===== administrators count as owners wherever ownership is checked =====
create or replace function public.owns_station(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stations s
    where s.id = sid and (s.owner_id = auth.uid() or public.is_platform_admin())
  );
$$;

create or replace function public.owns_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wireframes w
    join public.stations s on s.id = w.station_id
    where w.id = wid and (s.owner_id = auth.uid() or public.is_platform_admin())
  );
$$;

-- ===== the role function now knows about administrators =====
create or replace function public.wireframe_role(wid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  w record;
  best text := null;
  r text;
begin
  if uid is null then return null; end if;
  select x.station_id, x.general_access, x.general_role, s.owner_id
    into w
    from public.wireframes x join public.stations s on s.id = x.station_id
    where x.id = wid;
  if not found then return null; end if;
  if w.owner_id = uid then return 'owner'; end if;
  if public.is_platform_admin() then return 'admin'; end if;

  mail := public.current_email();
  if mail is not null then
    select i.role into r from public.wireframe_invites i where i.wireframe_id = wid and i.email = mail;
    best := r;
  end if;

  if w.general_access = 'anyone'
     and exists (select 1 from public.wireframe_access a where a.wireframe_id = wid and a.user_id = uid)
     and not exists (select 1 from public.wireframe_blocks b where b.wireframe_id = wid and b.user_id = uid)
     and public.role_rank(w.general_role) > public.role_rank(best) then
    best := w.general_role;
  end if;
  return best;
end $$;

create or replace function public.can_comment_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.wireframe_role(wid) in ('owner', 'admin', 'editor', 'commenter'), false);
$$;

create or replace function public.can_edit_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.wireframe_role(wid) in ('owner', 'admin', 'editor'), false);
$$;

-- ===== list of every wireframe, for administrators only (empty for everyone else) =====
create or replace function public.admin_list_wireframes()
returns table (id uuid, title text, owner_name text, pages bigint, general_access text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.title, s.display_name,
         (select count(*) from public.screens sc where sc.wireframe_id = w.id),
         w.general_access, w.updated_at
  from public.wireframes w
  join public.stations s on s.id = w.station_id
  where public.is_platform_admin() and s.owner_id <> auth.uid()
  order by w.updated_at desc;
$$;

-- ===== fix: deleting a whole wireframe must still be able to remove its page images =====
drop policy screens_delete on storage.objects;
create policy screens_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'screens'
    and (
      public.owns_station(((storage.foldername(name))[1])::uuid)
      or public.can_edit_wireframe(((storage.foldername(name))[2])::uuid)
    )
  );

-- ===== permissions =====
revoke all on function public.is_platform_admin(), public.admin_list_wireframes() from public, anon, authenticated;
grant execute on function public.admin_list_wireframes() to authenticated;

commit;