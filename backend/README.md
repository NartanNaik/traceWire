# Backend

Tracewire has no custom server. The backend is a [Supabase](https://supabase.com) project that provides:

| Service | Used for |
|---|---|
| Postgres + row-level security | All data and all access control |
| Auth (anonymous sign-ins) | Giving every browser a stable identity without sign-up |
| Storage (private bucket `screens`) | Wireframe images |
| Realtime | Live issue pins and live canvas updates for reviewers |

Everything is created by the SQL files in `migrations/`.

## Setup

1. Create a project at supabase.com.
2. Open **Authentication, Sign In / Providers** and turn on **Allow anonymous sign-ins**.
3. Open **SQL Editor** and run these files, in order, each once:
   1. `migrations/001_schema.sql` (tables, functions, policies, realtime, storage bucket)
   2. `migrations/002_wireframe_codes.sql` (per-wireframe codes, unique titles, per-wireframe access)
4. Open **Project Settings, API Keys** and copy the Project URL and the anon / publishable key into `frontend/.env`.

Run the migrations on a fresh project in this order. Do not run `001` again on a project that already has the tables.

## Keys

- Use the **anon / publishable** key (`sb_publishable_...` or `eyJ...`) in the frontend. It is designed to be public, because row-level security decides what it can do.
- Never put the **service_role / secret** key in this repository or in the frontend.

## What the migrations create

- Tables: `stations`, `wireframes`, `screens`, `links`, `issues`, `wireframe_access`
- Helper functions: `owns_station`, `can_read_wireframe`, `can_read_station`
- RPC functions called by the app: `ensure_station`, `join_wireframe`, `regenerate_wireframe_code`
- A unique index so a station cannot have two wireframes with the same title (case and spacing ignored)
- A trigger that always generates a wireframe's code on the server
- Realtime publication for `issues`, `screens` and `links`
- The private storage bucket `screens` with read, insert and delete policies

## Changing the schema later

Add a new numbered file (`003_...sql`) in `migrations/` and run it in the SQL Editor. Do not edit files that have already been applied.