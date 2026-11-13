-- Tracewire migration 004: threaded replies, reactions and reply images. Run once, after 003.

begin;

-- ---------- replies ----------
create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  parent_id uuid references public.issue_comments(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null default '' check (char_length(body) <= 4000),
  image_path text,
  created_at timestamptz not null default now(),
  constraint comment_has_content check (char_length(btrim(body)) > 0 or image_path is not null)
);
create index on public.issue_comments (issue_id);
create index on public.issue_comments (wireframe_id);
create index on public.issue_comments (parent_id);

alter table public.issue_comments enable row level security;

create policy comments_select on public.issue_comments for select to authenticated
  using (public.can_read_wireframe(wireframe_id));

create policy comments_insert on public.issue_comments for insert to authenticated
  with check (
    public.can_read_wireframe(wireframe_id)
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

create policy comments_delete on public.issue_comments for delete to authenticated
  using (author_id = auth.uid() or public.owns_station(station_id));

grant select, insert, delete on public.issue_comments to authenticated;

-- ---------- reactions (on an issue, or on one of its replies) ----------
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  comment_id uuid references public.issue_comments(id) on delete cascade,
  wireframe_id uuid not null references public.wireframes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now()
);
create unique index reactions_unique on public.reactions
  (user_id, issue_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), emoji);
create index on public.reactions (wireframe_id);
create index on public.reactions (issue_id);

alter table public.reactions enable row level security;

create policy reactions_select on public.reactions for select to authenticated
  using (public.can_read_wireframe(wireframe_id));

create policy reactions_insert on public.reactions for insert to authenticated
  with check (
    public.can_read_wireframe(wireframe_id)
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

create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.reactions to authenticated;

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['issue_comments', 'reactions'] loop
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- reply images (private bucket, path: stationId/wireframeId/file) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-images', 'comment-images', false, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy comment_img_read on storage.objects for select to authenticated
  using (
    bucket_id = 'comment-images'
    and public.can_read_wireframe(((storage.foldername(name))[2])::uuid)
  );

create policy comment_img_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and public.can_read_wireframe(((storage.foldername(name))[2])::uuid)
    and exists (
      select 1 from public.wireframes w
      where w.id = ((storage.foldername(name))[2])::uuid
        and w.station_id = ((storage.foldername(name))[1])::uuid
    )
  );

-- if this errors about owner_id, replace "owner_id = auth.uid()::text" with "owner = auth.uid()"
create policy comment_img_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'comment-images'
    and (
      public.owns_station(((storage.foldername(name))[1])::uuid)
      or owner_id = auth.uid()::text
    )
  );

commit;