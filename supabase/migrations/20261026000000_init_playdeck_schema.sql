-- ========================================================
-- Playdeck Schema: Profiles, Custom Lists, Friends, Auth
-- ========================================================

-- Enable pgcrypto for password hashing
create extension if not exists pgcrypto;

-- 1. Profiles Table
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (char_length(username) >= 3 and char_length(username) <= 24),
  display_name text not null check (char_length(display_name) <= 30),
  password_hash text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- 2. Custom Lists Table (Saved word decks)
create table if not exists public.custom_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) >= 1 and char_length(title) <= 60),
  description text default '',
  items jsonb not null default '[]'::jsonb,
  is_public boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. Friendships Table
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now() not null,
  unique (user_id, friend_id),
  constraint cant_friend_self check (user_id != friend_id)
);

-- 4. Auth Functions (Simple username + password without email/verification)
create or replace function public.playdeck_register(
  p_username text,
  p_password text,
  p_display_name text default null
)
returns jsonb as $$
declare
  clean_username text;
  display text;
  new_id uuid;
begin
  clean_username := lower(regexp_replace(trim(p_username), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(clean_username) < 3 or char_length(clean_username) > 24 then
    return jsonb_build_object('ok', false, 'error', 'Username must be between 3 and 24 characters.');
  end if;

  if char_length(p_password) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 4 characters.');
  end if;

  if exists (select 1 from public.profiles where username = clean_username) then
    return jsonb_build_object('ok', false, 'error', 'Username @' || clean_username || ' is already taken. Try another.');
  end if;

  new_id := gen_random_uuid();
  display := coalesce(nullif(trim(p_display_name), ''), clean_username);

  insert into public.profiles (id, username, display_name, password_hash)
  values (
    new_id,
    clean_username,
    display,
    extensions.crypt(p_password, extensions.gen_salt('bf'))
  );

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', new_id,
      'username', clean_username,
      'display_name', display
    )
  );
end;
$$ language plpgsql security definer;

create or replace function public.playdeck_login(
  p_username text,
  p_password text
)
returns jsonb as $$
declare
  clean_username text;
  u record;
begin
  clean_username := lower(regexp_replace(trim(p_username), '[^a-zA-Z0-9_]', '', 'g'));
  select * into u from public.profiles where username = clean_username;

  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'User @' || clean_username || ' not found.');
  end if;

  if u.password_hash is null or u.password_hash != extensions.crypt(p_password, u.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'Incorrect password. Please try again.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'display_name', u.display_name,
      'avatar_url', u.avatar_url
    )
  );
end;
$$ language plpgsql security definer;

grant execute on function public.playdeck_register(text, text, text) to anon, authenticated;
grant execute on function public.playdeck_login(text, text) to anon, authenticated;
