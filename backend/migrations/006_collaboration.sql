-- Tracewire migration 006: collaboration (invited emails, general access) and layout reset.
begin;

-- ===== sharing settings =====
-- existing wireframes were shared by code, so they stay "anyone with the code, can comment"
alter table public.wireframes
  add column general_access text not null default 'anyone' check (general_access in ('restricted', 'anyone')),
  add column general_role text not null default 'commenter' check (general_role in ('viewer', 'commenter', 'editor'));
-- new wireframes start private
alter table public.wireframes alter column general_access set default 'restricted';

revoke update on public.wireframes from authenticated;
grant update (title, view_x, view_y, view_zoom, general_access, general_role) on public.wireframes to authenticated;

-- ===== who is calling (confirmed email only) =====
create or replace function public.current_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null;
$$;

create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end;
$$;

-- ===== invited people =====
create table public.wireframe_invites (
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  email text not null check (
    email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (wireframe_id, email)
);
create index on public.wireframe_invites (email);
alter table public.wireframe_invites enable row level security;

create policy invites_select on public.wireframe_invites for select to authenticated
  using (public.owns_wireframe(wireframe_id) or email = public.current_email());
create policy invites_insert on public.wireframe_invites for insert to authenticated
  with check (public.owns_wireframe(wireframe_id));
create policy invites_update on public.wireframe_invites for update to authenticated
  using (public.owns_wireframe(wireframe_id)) with check (public.owns_wireframe(wireframe_id));
create policy invites_delete on public.wireframe_invites for delete to authenticated
  using (public.owns_wireframe(wireframe_id) or email = public.current_email());
grant select, insert, delete on public.wireframe_invites to authenticated;
grant update (role) on public.wireframe_invites to authenticated;

-- ===== the one function that decides everything =====
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

create or replace function public.can_read_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.wireframe_role(wid) is not null;
$$;
create or replace function public.can_comment_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.wireframe_role(wid) in ('owner', 'editor', 'commenter'), false);
$$;
create or replace function public.can_edit_wireframe(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.wireframe_role(wid) in ('owner', 'editor'), false);
$$;

create or replace function public.can_read_station(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stations s where s.id = sid and s.owner_id = auth.uid())
      or exists (select 1 from public.wireframes w where w.station_id = sid and public.wireframe_role(w.id) is not null);
$$;

-- ===== joining with a code respects general access =====
create or replace function public.join_wireframe(p_code text) returns public.wireframes
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wf public.wireframes;
  clean text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  mail text := public.current_email();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into wf from public.wireframes where code = clean;
  if not found then raise exception 'code_not_found'; end if;
  if public.owns_station(wf.station_id) then return wf; end if;
  if mail is not null and exists (
    select 1 from public.wireframe_invites i where i.wireframe_id = wf.id and i.email = mail
  ) then
    return wf;
  end if;
  if wf.general_access <> 'anyone' then raise exception 'access_restricted'; end if;
  if exists (select 1 from public.wireframe_blocks b where b.wireframe_id = wf.id and b.user_id = uid) then
    raise exception 'access_blocked';
  end if;
  insert into public.wireframe_access (user_id, wireframe_id) values (uid, wf.id) on conflict do nothing;
  return wf;
end $$;

-- ===== wireframes shared with me (effective role) =====
create or replace function public.shared_with_me()
returns table (id uuid, title text, owner_name text, role text)
language sql stable security definer set search_path = public as $$
  with cand as (
    select a.wireframe_id as wid from public.wireframe_access a where a.user_id = auth.uid()
    union
    select i.wireframe_id from public.wireframe_invites i where i.email = public.current_email()
  )
  select w.id, w.title, s.display_name, public.wireframe_role(w.id)
  from cand c
  join public.wireframes w on w.id = c.wid
  join public.stations s on s.id = w.station_id
  where s.owner_id <> auth.uid() and public.wireframe_role(w.id) is not null
  order by w.updated_at desc;
$$;

-- ===== unread: only look at wireframes this person can reach =====
create or replace function public.unread_issues() returns table (wireframe_id uuid, issue_id uuid)
language sql stable security definer set search_path = public as $$
  with cand as (
    select w.id as wid from public.wireframes w
      join public.stations s on s.id = w.station_id where s.owner_id = auth.uid()
    union
    select a.wireframe_id from public.wireframe_access a where a.user_id = auth.uid()
    union
    select i.wireframe_id from public.wireframe_invites i where i.email = public.current_email()
  )
  select i.wireframe_id, i.id
  from cand c
  join public.issues i on i.wireframe_id = c.wid
  left join public.issue_reads r on r.issue_id = i.id and r.user_id = auth.uid()
  where public.can_read_wireframe(c.wid)
    and (
      (r.issue_id is null and i.author_id <> auth.uid())
      or exists (
        select 1 from public.issue_comments cm
        where cm.issue_id = i.id and cm.author_id <> auth.uid()
          and cm.created_at > coalesce(r.read_at, '-infinity'::timestamptz))
    );
$$;

-- ===== layout reset =====
alter table public.screens add column home_x double precision, add column home_y double precision;

update public.screens s
set home_x = t.hx, home_y = 0
from (
  select id,
    coalesce(sum(w + 80) over (
      partition by wireframe_id order by position, created_at, id
      rows between unbounded preceding and 1 preceding), 0) as hx
  from public.screens
) t
where t.id = s.id;

alter table public.screens alter column home_x set not null, alter column home_y set not null;

create or replace function public.set_screen_home() returns trigger
language plpgsql as $$
begin
  if new.home_x is null then new.home_x := new.x; end if;
  if new.home_y is null then new.home_y := new.y; end if;
  return new;
end $$;
create trigger screens_home before insert on public.screens for each row execute function public.set_screen_home();

create or replace function public.reset_layout(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_wireframe(p_id) then raise exception 'not_allowed'; end if;
  update public.screens set x = home_x, y = home_y where wireframe_id = p_id;
end $$;

-- ===== editors can change content; commenters can comment; viewers can only read =====
drop policy screens_insert on public.screens;
drop policy screens_update on public.screens;
drop policy screens_delete on public.screens;
create policy screens_insert on public.screens for insert to authenticated
  with check (public.can_edit_wireframe(wireframe_id));
create policy screens_update on public.screens for update to authenticated
  using (public.can_edit_wireframe(wireframe_id)) with check (public.can_edit_wireframe(wireframe_id));
create policy screens_delete on public.screens for delete to authenticated
  using (public.can_edit_wireframe(wireframe_id));

drop policy links_insert on public.links;
drop policy links_update on public.links;
drop policy links_delete on public.links;
create policy links_insert on public.links for insert to authenticated
  with check (public.can_edit_wireframe(wireframe_id));
create policy links_update on public.links for update to authenticated
  using (public.can_edit_wireframe(wireframe_id)) with check (public.can_edit_wireframe(wireframe_id));
create policy links_delete on public.links for delete to authenticated
  using (public.can_edit_wireframe(wireframe_id));

drop policy issues_insert on public.issues;
drop policy issues_update on public.issues;
create policy issues_insert on public.issues for insert to authenticated
  with check (
    public.can_comment_wireframe(wireframe_id)
    and author_id = auth.uid()
    and exists (select 1 from public.wireframes w where w.id = wireframe_id and w.station_id = issues.station_id)
  );
create policy issues_update on public.issues for update to authenticated
  using (author_id = auth.uid() or public.can_edit_wireframe(wireframe_id))
  with check (author_id = auth.uid() or public.can_edit_wireframe(wireframe_id));

-- only the author may change the text of an issue; editors may resolve or reopen it
create or replace function public.guard_issue_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from old.author_id
     and (new.title is distinct from old.title or new.details is distinct from old.details or new.fix is distinct from old.fix) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
create trigger issues_update_guard before update on public.issues
  for each row execute function public.guard_issue_update();

drop policy comments_insert on public.issue_comments;
create policy comments_insert on public.issue_comments for insert to authenticated
  with check (
    public.can_comment_wireframe(wireframe_id)
    and author_id = auth.uid()
    and exists (
      select 1 from public.issues i
      where i.id = issue_comments.issue_id
        and i.wireframe_id = issue_comments.wireframe_id
        and i.station_id = issue_comments.station_id
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.issue_comments p
        where p.id = issue_comments.parent_id and p.issue_id = issue_comments.issue_id
      )
    )
  );

drop policy reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (
    public.can_comment_wireframe(wireframe_id)
    and user_id = auth.uid()
    and exists (
      select 1 from public.issues i
      where i.id = reactions.issue_id and i.wireframe_id = reactions.wireframe_id
    )
    and (
      comment_id is null
      or exists (
        select 1 from public.issue_comments c
        where c.id = reactions.comment_id and c.issue_id = reactions.issue_id
      )
    )
  );

-- ===== storage: editors upload page images, commenters upload reply images =====
drop policy screens_insert on storage.objects;
drop policy screens_delete on storage.objects;
create policy screens_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'screens'
    and public.can_edit_wireframe(((storage.foldername(name))[2])::uuid)
    and exists (
      select 1 from public.wireframes w
      where w.id = ((storage.foldername(name))[2])::uuid
        and w.station_id = ((storage.foldername(name))[1])::uuid
    )
  );
create policy screens_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'screens'
    and public.can_edit_wireframe(((storage.foldername(name))[2])::uuid)
  );

drop policy comment_img_insert on storage.objects;
create policy comment_img_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and public.can_comment_wireframe(((storage.foldername(name))[2])::uuid)
    and exists (
      select 1 from public.wireframes w
      where w.id = ((storage.foldername(name))[2])::uuid
        and w.station_id = ((storage.foldername(name))[1])::uuid
    )
  );

-- ===== file cleanup also works for editors =====
alter table public.storage_trash add column wireframe_id uuid;

create or replace function public.queue_file_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.image_path is not null then
    insert into public.storage_trash (bucket, path, station_id, wireframe_id)
    values (tg_argv[0], old.image_path, old.station_id, old.wireframe_id);
  end if;
  return old;
end $$;

drop policy trash_select on public.storage_trash;
drop policy trash_delete on public.storage_trash;
create policy trash_select on public.storage_trash for select to authenticated
  using (public.owns_station(station_id) or (wireframe_id is not null and public.can_edit_wireframe(wireframe_id)));
create policy trash_delete on public.storage_trash for delete to authenticated
  using (public.owns_station(station_id) or (wireframe_id is not null and public.can_edit_wireframe(wireframe_id)));

-- ===== invite limit =====
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
  elsif tg_table_name = 'wireframe_invites' then
    select count(*) into n from public.wireframe_invites where wireframe_id = new.wireframe_id;
    if n >= 50 then raise exception 'limit_reached: A wireframe can have at most 50 invited people.'; end if;
  end if;
  return new;
end $$;
create trigger invites_limits before insert on public.wireframe_invites
  for each row execute function public.enforce_limits();

-- ===== permissions =====
revoke all on function
  public.current_email(), public.role_rank(text), public.wireframe_role(uuid),
  public.can_comment_wireframe(uuid), public.can_edit_wireframe(uuid),
  public.shared_with_me(), public.reset_layout(uuid),
  public.set_screen_home(), public.guard_issue_update()
  from public, anon, authenticated;
grant execute on function
  public.current_email(), public.role_rank(text), public.wireframe_role(uuid),
  public.can_comment_wireframe(uuid), public.can_edit_wireframe(uuid),
  public.shared_with_me(), public.reset_layout(uuid)
  to authenticated;

commit;