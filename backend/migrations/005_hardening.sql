-- Tracewire migration 005: hardening and final features. Run once, after 004.
begin;

-- ===== helpers =====
create or replace function public.owns_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wireframes w
    join public.stations s on s.id = w.station_id
    where w.id = wid and s.owner_id = auth.uid());
$$;
revoke all on function public.owns_wireframe(uuid) from public, anon;
grant execute on function public.owns_wireframe(uuid) to authenticated;

-- ===== column-level permissions: clients can only change what the app changes =====
revoke update on public.stations from authenticated;
grant update (display_name) on public.stations to authenticated;

revoke update on public.issues from authenticated;
grant update (title, details, fix, status) on public.issues to authenticated;

revoke update on public.screens from authenticated;
grant update (name, x, y, note) on public.screens to authenticated;

revoke update on public.links from authenticated;
grant update (from_screen, from_x, from_y, to_screen, to_x, to_y, note) on public.links to authenticated;

-- ===== data consistency =====
alter table public.links add constraint links_coords check (
  from_x between 0 and 1 and from_y between 0 and 1 and to_x between 0 and 1 and to_y between 0 and 1) not valid;
alter table public.issues add constraint issues_pin check (
  pin_x between 0 and 1 and pin_y between 0 and 1) not valid;
alter table public.screens add constraint screens_size check (
  w > 0 and h > 0 and w <= 20000 and h <= 20000) not valid;

create or replace function public.guard_screen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.wireframes w where w.id = new.wireframe_id and w.station_id = new.station_id) then
    raise exception 'inconsistent_reference';
  end if;
  return new;
end $$;

create or replace function public.guard_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.from_screen = new.to_screen then raise exception 'inconsistent_reference'; end if;
  if not exists (select 1 from public.wireframes w where w.id = new.wireframe_id and w.station_id = new.station_id) then
    raise exception 'inconsistent_reference';
  end if;
  if (select count(*) from public.screens s
      where s.id in (new.from_screen, new.to_screen) and s.wireframe_id = new.wireframe_id) <> 2 then
    raise exception 'inconsistent_reference';
  end if;
  return new;
end $$;

create or replace function public.guard_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.screens s where s.id = new.screen_id and s.wireframe_id = new.wireframe_id) then
    raise exception 'inconsistent_reference';
  end if;
  return new;
end $$;

create trigger screens_guard before insert on public.screens for each row execute function public.guard_screen();
create trigger links_guard before insert or update on public.links for each row execute function public.guard_link();
create trigger issues_guard before insert on public.issues for each row execute function public.guard_issue();

-- ===== quotas and rate limits =====
create index on public.issues (author_id, created_at);
create index on public.issue_comments (author_id, created_at);
create index on public.reactions (user_id, created_at);

create or replace function public.enforce_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_table_name = 'wireframes' then
    select count(*) into n from public.wireframes where station_id = new.station_id;
    if n >= 50 then raise exception 'limit_reached: You can have at most 50 wireframes.'; end if;
  elsif tg_table_name = 'screens' then
    select count(*) into n from public.screens where wireframe_id = new.wireframe_id;
    if n >= 60 then raise exception 'limit_reached: A wireframe can have at most 60 pages.'; end if;
  elsif tg_table_name = 'issues' then
    select count(*) into n from public.issues where wireframe_id = new.wireframe_id;
    if n >= 300 then raise exception 'limit_reached: This wireframe has reached its limit of 300 issues.'; end if;
    select count(*) into n from public.issues where author_id = new.author_id and created_at > now() - interval '1 minute';
    if n >= 10 then raise exception 'rate_limited'; end if;
  elsif tg_table_name = 'issue_comments' then
    select count(*) into n from public.issue_comments where author_id = new.author_id and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited'; end if;
    if new.image_path is not null then
      select count(*) into n from public.issue_comments
        where author_id = new.author_id and wireframe_id = new.wireframe_id and image_path is not null;
      if n >= 40 then raise exception 'limit_reached: You have reached the image limit for this wireframe.'; end if;
    end if;
  elsif tg_table_name = 'reactions' then
    select count(*) into n from public.reactions where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 60 then raise exception 'rate_limited'; end if;
  end if;
  return new;
end $$;

create trigger wireframes_limits before insert on public.wireframes for each row execute function public.enforce_limits();
create trigger screens_limits before insert on public.screens for each row execute function public.enforce_limits();
create trigger issues_limits before insert on public.issues for each row execute function public.enforce_limits();
create trigger comments_limits before insert on public.issue_comments for each row execute function public.enforce_limits();
create trigger reactions_limits before insert on public.reactions for each row execute function public.enforce_limits();

-- ===== editing replies =====
alter table public.issue_comments add column edited_at timestamptz;

create or replace function public.touch_comment() returns trigger
language plpgsql as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
create trigger comments_touch before update on public.issue_comments for each row execute function public.touch_comment();

create policy comments_update on public.issue_comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
grant update (body) on public.issue_comments to authenticated;

-- ===== guaranteed file cleanup =====
create table public.storage_trash (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  station_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.storage_trash (station_id);
alter table public.storage_trash enable row level security;
create policy trash_select on public.storage_trash for select to authenticated using (public.owns_station(station_id));
create policy trash_delete on public.storage_trash for delete to authenticated using (public.owns_station(station_id));
grant select, delete on public.storage_trash to authenticated;

create or replace function public.queue_file_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.image_path is not null then
    insert into public.storage_trash (bucket, path, station_id) values (tg_argv[0], old.image_path, old.station_id);
  end if;
  return old;
end $$;
create trigger screens_trash after delete on public.screens
  for each row execute function public.queue_file_removal('screens');
create trigger comments_trash after delete on public.issue_comments
  for each row execute function public.queue_file_removal('comment-images');

-- ===== unread tracking =====
create table public.issue_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, issue_id)
);
create index on public.issue_reads (wireframe_id);
alter table public.issue_reads enable row level security;

create or replace function public.mark_issue_read(p_issue uuid) returns void
language plpgsql security definer set search_path = public as $$
declare wid uuid;
begin
  select i.wireframe_id into wid from public.issues i where i.id = p_issue;
  if wid is null or not public.can_read_wireframe(wid) then return; end if;
  insert into public.issue_reads (user_id, issue_id, wireframe_id, read_at)
    values (auth.uid(), p_issue, wid, now())
    on conflict (user_id, issue_id) do update set read_at = now();
end $$;

create or replace function public.unread_issues() returns table (wireframe_id uuid, issue_id uuid)
language sql stable security definer set search_path = public as $$
  select i.wireframe_id, i.id
  from public.issues i
  left join public.issue_reads r on r.issue_id = i.id and r.user_id = auth.uid()
  where public.can_read_wireframe(i.wireframe_id)
    and (
      (r.issue_id is null and i.author_id <> auth.uid())
      or exists (
        select 1 from public.issue_comments c
        where c.issue_id = i.id and c.author_id <> auth.uid()
          and c.created_at > coalesce(r.read_at, '-infinity'::timestamptz))
    );
$$;

-- ===== managing individual reviewers =====
create table public.wireframe_blocks (
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wireframe_id, user_id)
);
alter table public.wireframe_blocks enable row level security;

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
    if exists (select 1 from public.wireframe_blocks b where b.wireframe_id = wf.id and b.user_id = uid) then
      raise exception 'access_blocked';
    end if;
    insert into public.wireframe_access (user_id, wireframe_id) values (uid, wf.id) on conflict do nothing;
  end if;
  return wf;
end $$;

create or replace function public.list_reviewers(p_id uuid)
returns table (user_id uuid, joined_at timestamptz, blocked boolean, names text[], issue_count bigint, reply_count bigint)
language sql stable security definer set search_path = public as $$
  with people as (
    select a.user_id as uid, a.created_at as joined, false as is_blocked
      from public.wireframe_access a where a.wireframe_id = p_id
    union all
    select b.user_id, b.created_at, true
      from public.wireframe_blocks b where b.wireframe_id = p_id
  )
  select p.uid, p.joined, p.is_blocked,
    coalesce((select array_agg(distinct x.n) from (
      select i.author_name as n from public.issues i where i.wireframe_id = p_id and i.author_id = p.uid
      union
      select c.author_name from public.issue_comments c where c.wireframe_id = p_id and c.author_id = p.uid
    ) x), '{}'::text[]),
    (select count(*) from public.issues i where i.wireframe_id = p_id and i.author_id = p.uid),
    (select count(*) from public.issue_comments c where c.wireframe_id = p_id and c.author_id = p.uid)
  from people p
  where public.owns_wireframe(p_id)
  order by p.is_blocked, p.joined;
$$;

create or replace function public.set_reviewer_access(p_id uuid, p_user uuid, p_allow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_wireframe(p_id) then raise exception 'not_allowed'; end if;
  if p_allow then
    delete from public.wireframe_blocks where wireframe_id = p_id and user_id = p_user;
  else
    delete from public.wireframe_access where wireframe_id = p_id and user_id = p_user;
    insert into public.wireframe_blocks (wireframe_id, user_id) values (p_id, p_user) on conflict do nothing;
  end if;
end $$;

-- ===== function permissions =====
revoke all on function
  public.guard_screen(), public.guard_link(), public.guard_issue(), public.enforce_limits(),
  public.touch_comment(), public.queue_file_removal(),
  public.mark_issue_read(uuid), public.unread_issues(),
  public.list_reviewers(uuid), public.set_reviewer_access(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.mark_issue_read(uuid), public.unread_issues(),
  public.list_reviewers(uuid), public.set_reviewer_access(uuid, uuid, boolean)
  to authenticated;

-- ===== animated GIFs =====
update storage.buckets
  set allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg', 'image/gif']
  where id in ('screens', 'comment-images');

commit;