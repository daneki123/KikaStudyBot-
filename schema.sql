-- Kika — run once in Supabase (SQL Editor → paste → Run). Safe to re-run.

create table if not exists users (
  telegram_id     bigint primary key,
  username        text,
  first_name      text,
  actions_used    integer not null default 0,   -- AI generations used in current cycle
  quota_reset_at  timestamptz,
  bonus_actions   integer not null default 0,   -- extra from ads / referrals
  total_actions   integer not null default 0,   -- lifetime
  last_bonus      timestamptz,
  premium_until   timestamptz,                   -- Study Pass (Stars)
  referrer_id     bigint,
  referrals_count integer not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists materials (
  id            bigint generated always as identity primary key,
  telegram_id   bigint not null,
  title         text not null,
  content       text not null,                 -- extracted/pasted study text
  source        text not null default 'paste', -- 'paste' | 'pdf'
  created_at    timestamptz not null default now()
);
create index if not exists materials_user_idx on materials (telegram_id, created_at desc);

create table if not exists study_items (
  id            bigint generated always as identity primary key,
  material_id   bigint not null,
  telegram_id   bigint not null,
  type          text not null,                 -- 'summary' | 'quiz' | 'simple'
  content       text not null,                 -- text for summary/simple; JSON for quiz
  created_at    timestamptz not null default now()
);
create index if not exists study_items_material_idx on study_items (material_id, created_at desc);
