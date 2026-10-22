-- 2nd Notes: run once in Supabase → SQL Editor
create table if not exists public.second_notes (
  id uuid primary key,
  funeral_home_id text not null,
  funeral_home_name text,
  case_id text,
  case_ref text,
  deceased_name text,
  answers jsonb not null default '{}'::jsonb,
  pdf_path text,
  submitted_by text,
  submitted_role text,
  status text not null default 'awaiting',   -- 'awaiting' (not in care yet) | 'linked'
  submitted_at timestamptz not null default now()
);
create index if not exists second_notes_fh_idx on public.second_notes (funeral_home_id, submitted_at desc);

-- Same access model as the app's other tables (anon key)
alter table public.second_notes enable row level security;
drop policy if exists "second_notes_app_access" on public.second_notes;
create policy "second_notes_app_access" on public.second_notes for all to anon using (true) with check (true);
