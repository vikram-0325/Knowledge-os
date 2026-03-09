-- ═══════════════════════════════════════════════════════
--  KNOWLEDGE OS — Supabase Database Schema
--  HOW TO USE:
--  1. Go to your Supabase project
--  2. Click "SQL Editor" in the left sidebar
--  3. Click "New Query"
--  4. Select ALL text in this file, copy it, paste it there
--  5. Click "Run" (green button)
--  That's it — all tables will be created!
-- ═══════════════════════════════════════════════════════

-- ── Profiles ─────────────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users primary key,
  name text,
  email text,
  avatar_url text,
  grade text,
  goal text,
  style text,
  daily_time text,
  struggle text,
  subjects text[],
  total_xp int default 0,
  streak int default 0,
  last_active timestamptz,
  strong_topics text[],
  weak_topics text[],
  onboarding_done bool default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── User Badges ───────────────────────────────────────
create table if not exists user_badges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  badge_id text,
  earned_at timestamptz default now()
);

-- ── Chat Sessions ─────────────────────────────────────
create table if not exists chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Notes ─────────────────────────────────────────────
create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  content text,
  subject text,
  is_public bool default false,
  likes int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Flashcard Decks ───────────────────────────────────
create table if not exists flashcard_decks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  subject text,
  cards jsonb default '[]'::jsonb,
  is_public bool default false,
  created_at timestamptz default now()
);

-- ── Tasks ─────────────────────────────────────────────
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  subject text,
  due_date date,
  priority text default 'medium',
  done bool default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ── Forum Posts ───────────────────────────────────────
create table if not exists forum_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  content text,
  subject text,
  votes int default 0,
  is_answered bool default false,
  created_at timestamptz default now()
);

-- ── Forum Replies ─────────────────────────────────────
create table if not exists forum_replies (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references forum_posts,
  user_id uuid references profiles,
  content text,
  is_ai bool default false,
  created_at timestamptz default now()
);

-- ── Study Rooms ───────────────────────────────────────
create table if not exists study_rooms (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references profiles,
  name text,
  subject text,
  is_active bool default true,
  created_at timestamptz default now()
);

-- ── Room Messages ─────────────────────────────────────
create table if not exists room_messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references study_rooms,
  user_id uuid references profiles,
  content text,
  created_at timestamptz default now()
);

-- ── Marketplace ───────────────────────────────────────
create table if not exists marketplace (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles,
  title text,
  description text,
  subject text,
  type text,
  content jsonb,
  active bool default true,
  downloads int default 0,
  created_at timestamptz default now()
);

-- ── RPC Function ─────────────────────────────────────
create or replace function inc_downloads(lid uuid)
returns void as $$
  update marketplace set downloads = downloads + 1 where id = lid;
$$ language sql;

-- ── Row Level Security ────────────────────────────────
alter table profiles enable row level security;
alter table chat_sessions enable row level security;
alter table notes enable row level security;
alter table flashcard_decks enable row level security;
alter table tasks enable row level security;
alter table user_badges enable row level security;
alter table forum_posts enable row level security;
alter table forum_replies enable row level security;
alter table study_rooms enable row level security;
alter table room_messages enable row level security;
alter table marketplace enable row level security;

-- ── RLS Policies ─────────────────────────────────────

-- Profiles: users can read/write their own
create policy "profiles_own" on profiles
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Chat sessions: own only
create policy "chats_own" on chat_sessions
  using (auth.uid() = user_id);

-- Notes: own + public readable
create policy "notes_own" on notes
  using (auth.uid() = user_id);

create policy "notes_public_read" on notes
  for select using (is_public = true);

-- Flashcard decks: own only
create policy "decks_own" on flashcard_decks
  using (auth.uid() = user_id);

-- Tasks: own only
create policy "tasks_own" on tasks
  using (auth.uid() = user_id);

-- Badges: own only
create policy "badges_own" on user_badges
  using (auth.uid() = user_id);

-- Forum: anyone can read, auth users can write
create policy "forum_posts_read" on forum_posts
  for select using (true);

create policy "forum_posts_write" on forum_posts
  for insert with check (auth.uid() = user_id);

create policy "forum_replies_read" on forum_replies
  for select using (true);

create policy "forum_replies_write" on forum_replies
  for insert with check (auth.uid() = user_id);

-- Study rooms: anyone can read active, auth can create
create policy "rooms_read" on study_rooms
  for select using (is_active = true);

create policy "rooms_create" on study_rooms
  for insert with check (auth.uid() = created_by);

create policy "room_msgs_read" on room_messages
  for select using (true);

create policy "room_msgs_send" on room_messages
  for insert with check (auth.uid() = user_id);

-- Marketplace: anyone can read active listings, auth can create
create policy "market_read" on marketplace
  for select using (active = true);

create policy "market_create" on marketplace
  for insert with check (auth.uid() = user_id);

-- ── Enable Realtime for Study Rooms ──────────────────
alter publication supabase_realtime add table room_messages;
