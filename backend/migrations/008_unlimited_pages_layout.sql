-- Tracewire migration 008: unlimited pages per wireframe, and a function to set many page positions at once.
-- Run once, after 007.
begin;

-- ===== remove the page limit =====
drop trigger if exists screens_limits on public.screens;

create or replace function public.enforce_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_table_name = 'wireframes' then
    select count(*) into n from public.wireframes where station_id = new.station_id;
    if n >= 50 then raise exception 'limit_reached: You can have at most 50 wireframes.'; end if;
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

-- ===== set the positions of many pages in one step (Format, Reset layout, undo and redo) =====
create or replace function public.set_layout(p_id uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_wireframe(p_id) then raise exception 'not_allowed'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'not_allowed'; end if;

  update public.screens s
  set x = i.x, y = i.y
  from jsonb_to_recordset(p_items) as i(id uuid, x double precision, y double precision)
  where s.id = i.id
    and s.wireframe_id = p_id
    and abs(i.x) < 10000000
    and abs(i.y) < 10000000;
end $$;

revoke all on function public.set_layout(uuid, jsonb) from public, anon;
grant execute on function public.set_layout(uuid, jsonb) to authenticated;

commit;