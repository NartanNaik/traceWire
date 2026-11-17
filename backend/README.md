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
2. **Sign In / Providers, Email**: keep the email provider enabled and **Confirm email turned on**. This is a security requirement. Invites match confirmed emails only, and without confirmation someone could attach an address they do not own.
3. **URL Configuration**: set **Site URL** to your deployed URL, and add `https://YOUR-APP.vercel.app/**` and `http://localhost:5173/**` under **Redirect URLs**.
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
| `006_collaboration.sql` | Email invites, general access, the four roles, shared-with-me, layout reset |

Run them on a fresh project in this order. Do not run a file again on a project that already has it.

**4. Copy the keys.** Open **Project Settings, API Keys** and copy the Project URL and the anon / publishable key into `frontend/.env`.

## Keys

- Use the **anon / publishable** key (`sb_publishable_...` or `eyJ...`) in the frontend. It is designed to be public, because row-level security decides what it can do.
- Never put the **service_role / secret** key in this repository or in the frontend.

## Roles

`public.wireframe_role(wireframe_id)` returns `owner`, `editor`, `commenter`, `viewer` or null. It is the single source of truth, built from:

1. The owner check on the wireframe's workspace.
2. A row in `wireframe_invites` matching the caller's **confirmed** email.
3. The wireframe's general access, which applies only when it is set to `anyone`, the caller joined with the code, and the caller is not blocked. The higher role of (2) and (3) wins.

Three helpers are defined from it and used by every policy: `can_read_wireframe`, `can_comment_wireframe` and `can_edit_wireframe`.

| Capability | Viewer | Commenter | Editor | Owner |
|---|---|---|---|---|
| Read everything on the wireframe | Yes | Yes | Yes | Yes |
| Report issues, reply, react | No | Yes | Yes | Yes |
| Add, move, delete pages. Draw wires. Write notes. Reset layout. Resolve issues | No | No | Yes | Yes |
| Rename, delete, share, manage people, change the code | No | No | No | Yes |

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

**Functions the app calls (RPC)**
`ensure_station`, `join_wireframe`, `regenerate_wireframe_code`, `wireframe_role`, `shared_with_me`, `reset_layout`, `list_reviewers`, `set_reviewer_access`, `unread_issues`, `mark_issue_read`

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
- Editors can upload and delete page images. Commenters and above can upload reply images. Anyone who can read the wireframe can read its images.

**Realtime**
Publication for `issues`, `screens`, `links`, `issue_comments`, `reactions` and `wireframes`, with full row identity so updates and deletes are delivered correctly.

## Checking that it worked

In the SQL Editor:

```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in ('stations','wireframes','screens','links','issues','issue_comments',
                     'reactions','wireframe_access','wireframe_blocks','wireframe_invites',
                     'issue_reads','storage_trash');
-- expect 12

select id, public from storage.buckets where id in ('screens', 'comment-images');
-- expect 2 rows, both public = false
```

## Backups

Supabase's free plan does not include automatic database backups. Use the **Export** button on each wireframe (Markdown or JSON) for the content, and the Supabase dashboard's database export for a full copy. Page and reply images are stored in the buckets and are not part of an export file.

## Changing the schema later

Add a new numbered file (`007_...sql`) in `migrations/` and run it in the SQL Editor. Do not edit files that have already been applied. Wrap changes in `begin; ... commit;` so a failure leaves nothing half-applied.