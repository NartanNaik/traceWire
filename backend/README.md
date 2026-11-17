# Backend

Tracewire has no custom server. The backend is a [Supabase](https://supabase.com) project that provides:

| Service | Used for |
|---|---|
| Postgres + row-level security | All data and all access control |
| Auth (anonymous sign-ins and email links) | A stable identity for everyone without a sign-up form, and optional email accounts |
| Storage (private buckets `screens` and `comment-images`) | Wireframe page images and reply images |
| Realtime | Live issues, replies, reactions, page and wire changes, and who is viewing (presence) |

Everything is created by the SQL files in `migrations/`.

## Setup

**1. Create a project** at supabase.com.

**2. Configure Auth** (Authentication in the dashboard):

1. **Sign In / Providers**: turn on **Allow anonymous sign-ins**.
2. **Sign In / Providers, Email**: keep the email provider enabled and **Confirm email turned on**. This is a security requirement. Invites and administrator access match confirmed emails only, and without confirmation someone could attach an address they do not own.
3. **URL Configuration**: set **Site URL** to your deployed address, for example `https://trace-wire.vercel.app`. Add `https://trace-wire.vercel.app/**` and `http://localhost:5173/**` under **Redirect URLs**. Do not add wildcard hosts such as `https://*.vercel.app/**`, because any other site on that host could then receive sign-in tokens.
4. **Emails, SMTP Settings**: add a custom SMTP provider before real use. The built-in sender allows only a few emails per hour.
5. Leave **CAPTCHA off**. The app signs in anonymously and would break with it on. Database rate limits cover abuse instead.

**3. Run the migrations.** Open **SQL Editor** and run these files in order, each once, each in a single run:

| File | What it adds |
|---|---|
| `001_schema.sql` | Tables, helper functions, row-level security, realtime and the `screens` bucket |
| `002_wireframe_codes.sql` | Per-wireframe codes, unique titles per workspace, per-wireframe access |
| `003_notes.sql` | Notes on pages and wires |
| `004_discussion.sql` | Threaded replies, reactions and the `comment-images` bucket |
| `005_hardening.sql` | Column-level permissions, consistency checks, quotas and rate limits, reply editing, guaranteed file cleanup, unread tracking, reviewer management, GIF support |
| `006_collaboration.sql` | Email invites, general access, the roles, shared-with-me, layout reset |
| `007_admin.sql` | Platform administrator, the all-wireframes list, and a fix so deleting a wireframe can always remove its page images |

Run them on a fresh project in this order. Do not run a file again on a project that already has it. Each file is wrapped in `begin; ... commit;`, so a failed run changes nothing and is safe to run again after the cause is fixed.

**4. Copy the keys.** Open **Project Settings, API Keys** and copy the Project URL and the anon / publishable key into `frontend/.env`.

## Keys

- Use the **anon / publishable** key (`sb_publishable_...` or `eyJ...`) in the frontend. It is designed to be public, because row-level security decides what it can do.
- Never put the **service_role / secret** key in this repository or in the frontend.

## Roles

`public.wireframe_role(wireframe_id)` returns `owner`, `admin`, `editor`, `commenter`, `viewer` or null. It is the single source of truth, built from, in order:

1. The owner check on the wireframe's workspace. Result: `owner`.
2. Whether the caller is a platform administrator (see below). Result: `admin`.
3. A row in `wireframe_invites` matching the caller's **confirmed** email.
4. The wireframe's general access, which applies only when it is set to `anyone`, the caller joined with the code, and the caller is not blocked. The higher role of (3) and (4) wins.

Three helpers are defined from it and used by every policy: `can_read_wireframe`, `can_comment_wireframe` and `can_edit_wireframe`. `owns_station` and `owns_wireframe` also accept administrators, so every owner-level policy applies to them.

| Capability | Viewer | Commenter | Editor | Owner / Admin |
|---|---|---|---|---|
| Read everything on the wireframe | Yes | Yes | Yes | Yes |
| Report issues, reply, react | No | Yes | Yes | Yes |
| Add, move, delete pages. Draw wires. Write notes. Reset layout. Resolve issues | No | No | Yes | Yes |
| Rename, delete, share, manage people, change the code | No | No | No | Yes |

## Administrator

`platform_admins` lists the emails with owner-level access to every wireframe. No client can read or change this table. An email counts only when it is **confirmed** and its account has **no password**, so nobody can claim it by registering the address first.

The administrator also gets a list of all other workspaces' wireframes through `admin_list_wireframes()`, shown on the home page. The function returns nothing to anyone else.

The first administrator is added by `007_admin.sql`. Manage the list in the SQL Editor:

```sql
select * from public.platform_admins;

insert into public.platform_admins (email) values ('someone@example.com');   -- lowercase
delete from public.platform_admins where email = 'someone@example.com';
```

Check that an administrator's account qualifies:

```sql
select email,
       email_confirmed_at is not null as confirmed,
       coalesce(encrypted_password, '') = '' as passwordless
from auth.users
where lower(email) = 'naiknartana@gmail.com';
-- expect one row, confirmed = true and passwordless = true
```

The administrator links their email in the app (account icon, Link my email) and confirms it from the email. Protect that mailbox with two-step verification, because whoever controls it controls this role.

## What the migrations create

**Tables**
- `stations`: one workspace per user
- `wireframes`: title, code, view position, `general_access` and `general_role`
- `screens`: pages, with `x`, `y`, `home_x`, `home_y` and a `note`
- `links`: wires, with a `note`
- `issues`: pinned issues
- `issue_comments`: threaded replies (`parent_id`), with an optional image and `edited_at`
- `reactions`: emoji reactions on an issue or a reply
- `wireframe_access`: people who joined with a code
- `wireframe_blocks`: people removed from a wireframe
- `wireframe_invites`: invited emails and their roles
- `issue_reads`: when each person last read each issue (unread tracking)
- `storage_trash`: queue of files to delete from storage
- `platform_admins`: administrator emails (not readable by clients)

**Functions the app calls (RPC)**
`ensure_station`, `join_wireframe`, `regenerate_wireframe_code`, `wireframe_role`, `shared_with_me`, `admin_list_wireframes`, `reset_layout`, `list_reviewers`, `set_reviewer_access`, `unread_issues`, `mark_issue_read`

**Triggers**
- Codes are always generated on the server
- Consistency checks: pages, wires, issues and replies must belong to the same wireframe
- Quotas and rate limits (below)
- `edited_at` is set when a reply's text changes
- Only an issue's author can change its text. Editors can resolve or reopen it
- Deleted page images and reply images are queued in `storage_trash`
- New pages remember their original position in `home_x` and `home_y`

**Limits enforced in the database**

| Limit | Value |
|---|---|
| Wireframes per workspace | 50 |
| Pages per wireframe | 60 |
| Issues per wireframe | 300 |
| Invited people per wireframe | 50 |
| Reply images per person per wireframe | 40 |
| Issues per person per minute | 10 |
| Replies per person per minute | 20 |
| Reactions per person per minute | 60 |

**Storage**
- `screens` (page images, up to 10 MB) and `comment-images` (reply images, up to 5 MB), both private
- Object path: `stationId/wireframeId/file`
- Editors can upload page images. Owners, administrators and editors can delete them. Commenters and above can upload reply images. Anyone who can read the wireframe can read its images.

**Realtime**
Publication for `issues`, `screens`, `links`, `issue_comments`, `reactions` and `wireframes`, with full row identity so updates and deletes are delivered correctly.

## Checking that it worked

In the SQL Editor:

```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in ('stations','wireframes','screens','links','issues','issue_comments',
                     'reactions','wireframe_access','wireframe_blocks','wireframe_invites',
                     'issue_reads','storage_trash','platform_admins');
-- expect 13

select id, public from storage.buckets where id in ('screens', 'comment-images');
-- expect 2 rows, both public = false

select * from public.platform_admins;
-- expect your administrator email(s)
```

## Troubleshooting

**Verification or sign-in emails open `localhost:3000`.** The Supabase **Site URL** is still the default. Set it to your deployed address as described in Setup step 2, save, then request a new email. Emails that were already sent keep the old address.

**`relation "public.platform_admins" does not exist`.** Migration `007_admin.sql` has not been run yet. Run it in full, once.

**The administrator list does not appear on the home page.** Run the account check above. The email must be confirmed and passwordless, and you must be signed in with it in that browser.

**Someone cannot open a wireframe.** Confirm the wireframe's general access in Share. For a Restricted wireframe, the person must sign in with the exact email that was invited.

## Backups

Supabase's free plan does not include automatic database backups. Use the **Export** button on each wireframe (Markdown or JSON) for the content, and the Supabase dashboard's database export for a full copy. Page and reply images are stored in the buckets and are not part of an export file.

## Changing the schema later

Add a new numbered file (`008_...sql`) in `migrations/` and run it in the SQL Editor. Do not edit files that have already been applied. Wrap changes in `begin; ... commit;` so a failure leaves nothing half-applied.