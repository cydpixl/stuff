-- Isolated, public-read video sharing metadata.
create table if not exists public.watch_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 140),
  filename text not null,
  object_path text not null unique,
  thumbnail_path text,
  caption_path text,
  duration_seconds numeric not null default 0,
  bytes bigint not null default 0,
  mime text not null default 'video/mp4',
  status text not null default 'uploading' check (status in ('uploading','ready')),
  created_at timestamptz not null default now()
);
alter table public.watch_videos enable row level security;
grant select on public.watch_videos to anon, authenticated;
create policy "watch_ready_videos_public" on public.watch_videos for select to anon,authenticated using (status='ready');
-- No client-side mutation policies: admin writes go through the key-validated Edge Function.
create table if not exists public.watch_config (
  id int primary key check(id=1),
  secret_hash text not null
);
alter table public.watch_config enable row level security;
revoke all on public.watch_config from public,anon,authenticated;
grant select on public.watch_config to service_role;
insert into public.watch_config(id,secret_hash)
  values(1,'fec2466c57f012b8833b1b02225e55c00aa89680b69189a3a8cb6e726ca75cd1')
  on conflict(id) do update set secret_hash=excluded.secret_hash;
insert into storage.buckets (id,name,public,file_size_limit)
  values ('watch-videos','watch-videos',true,null),
         ('watch-thumbnails','watch-thumbnails',true,2097152),
         ('watch-captions','watch-captions',true,2097152)
  on conflict (id) do nothing;
-- No anon storage write policies are granted. Server-generated signed upload tokens authorize uploads.
