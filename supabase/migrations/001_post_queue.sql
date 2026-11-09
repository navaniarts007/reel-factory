-- Reel Factory cloud posting queue (Phase 3). Run once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run). Factory-only: its own
-- table + storage bucket, separate from any other project's tables.
create table if not exists public.post_queue (
  day int primary key,
  title text,
  caption text,
  video_file text,
  video_url text,
  scheduled_for timestamptz not null,
  status text not null default 'ready',          -- ready | posting | posted | failed
  ig_id text, ig_permalink text,
  yt_id text, yt_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.post_queue enable row level security;
-- The poster and the laptop use the service-role key, which bypasses RLS.
-- No public policies on the table: queue data is not public.

insert into storage.buckets (id, name, public)
values ('reel-factory', 'reel-factory', true)
on conflict (id) do nothing;

-- Videos must be publicly downloadable (Instagram fetches the file itself).
drop policy if exists "reel-factory public read" on storage.objects;
create policy "reel-factory public read" on storage.objects
  for select using (bucket_id = 'reel-factory');
