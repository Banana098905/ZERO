-- ZERO schema + RLS (V1.0.3). Run in Supabase SQL editor (or `supabase db push`). 新規プロジェクトは 0001 → 0002 の順に適用する（0002 は冪等）。
-- セキュリティ方針: SECURITY DEFINER 関数はすべて search_path を空にし、テーブル・関数は public. で修飾する（search_path を介した関数/テーブルの差し替えを防ぐ）。
-- テーブル定義（このファイルの前半）は既定の search_path（public）で作成される。
create extension if not exists pgcrypto;
create type visibility as enum ('public','unlisted','private');

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name)<=40),
  bio text check (char_length(bio)<=300),
  created_at timestamptz not null default now());
create table admins(user_id uuid primary key references auth.users on delete cascade);

create table works(
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description)<=500),
  engine text not null check (engine in ('code','logic','zero')),
  work_type text not null check (work_type ~ '^[a-z][a-z0-9-]{0,31}$'),
  tags text[] not null default '{}' check (cardinality(tags)<=10),
  license text not null default 'all-rights-reserved'
    check (license in ('all-rights-reserved','CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','CC-BY-NC-4.0','MIT')),
  visibility visibility not null default 'public',
  hidden boolean not null default false,
  version int not null default 1,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  payload_path text not null,
  thumb text check (thumb is null or (length(thumb)<=90000 and thumb ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
  derived_from uuid references works(id) on delete set null,
  derived_version int,
  likes int not null default 0, comments int not null default 0, remixes int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  -- 保存先は必ず「投稿者ID/作品ID.json」。他人の領域・他の作品の保存先を指すことはできない。
  constraint works_payload_path_canonical check (payload_path = author_id::text || '/' || id::text || '.json'));
create unique index works_payload_path_key on works(payload_path);
create index on works(created_at desc); create index on works(author_id); create index on works(derived_from);

create table likes(user_id uuid references profiles on delete cascade, work_id uuid references works on delete cascade, created_at timestamptz default now(), primary key(user_id,work_id));
create table bookmarks(user_id uuid references profiles on delete cascade, work_id uuid references works on delete cascade, created_at timestamptz default now(), primary key(user_id,work_id));
create table follows(follower_id uuid references profiles on delete cascade, followee_id uuid references profiles on delete cascade, created_at timestamptz default now(), primary key(follower_id,followee_id), check(follower_id<>followee_id));
create table comments(id uuid primary key default gen_random_uuid(), work_id uuid not null references works on delete cascade, user_id uuid not null references profiles on delete cascade, body text not null check (char_length(body) between 1 and 500), hidden boolean not null default false, created_at timestamptz default now());
create table reports(id uuid primary key default gen_random_uuid(), reporter_id uuid not null references profiles on delete cascade, target_type text not null check (target_type in ('work','comment','user')), target_id uuid not null, reason text not null check (char_length(reason) between 1 and 300), status text not null default 'open' check (status in ('open','resolved')), created_at timestamptz default now());

create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admins where user_id=auth.uid()) $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,username,display_name) values (new.id, lower(new.raw_user_meta_data->>'username'), left(coalesce(new.raw_user_meta_data->>'username',''),40)); return new; end $$;

create function public.works_before() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.works;
begin
  if tg_op='INSERT' then
    if new.payload_path is distinct from new.author_id::text || '/' || new.id::text || '.json' then
      raise exception 'payload_path must be {author_id}/{work_id}.json'; end if;
    if (select count(*) from public.works where author_id=new.author_id and created_at>now()-interval '1 hour')>=10 then raise exception 'rate limit: max 10 posts/hour'; end if;
    new.hidden:=false; new.likes:=0; new.comments:=0; new.remixes:=0;
    if new.derived_from is not null then
      select * into p from public.works where id=new.derived_from;
      if not found or p.hidden or (p.visibility='private' and p.author_id<>new.author_id) then raise exception 'remix source unavailable'; end if;
      if p.author_id<>new.author_id then
        if p.license='all-rights-reserved' then raise exception 'remix not permitted by license'; end if;
        if p.license='CC-BY-SA-4.0' and new.license<>'CC-BY-SA-4.0' then raise exception 'ShareAlike requires CC-BY-SA-4.0'; end if;
      end if;
      new.derived_version:=p.version;
    end if;
  else
    if new.id is distinct from old.id then raise exception 'id is immutable'; end if;
    if new.payload_path is distinct from old.payload_path then raise exception 'payload_path is immutable'; end if;
    if not public.is_admin() then new.hidden:=old.hidden; end if;
    new.author_id:=old.author_id; new.derived_from:=old.derived_from; new.derived_version:=old.derived_version;
    new.likes:=old.likes; new.comments:=old.comments; new.remixes:=old.remixes; new.created_at:=old.created_at; new.updated_at:=now();
  end if; return new; end $$;

create function public.bump() returns trigger language plpgsql security definer set search_path='' as $$
declare d int := case tg_op when 'INSERT' then 1 else -1 end; r record := case tg_op when 'INSERT' then new else old end;
begin
  if tg_table_name='likes' then update public.works set likes=greatest(likes+d,0) where id=r.work_id;
  elsif tg_table_name='comments' then update public.works set comments=greatest(comments+d,0) where id=r.work_id;
  elsif r.derived_from is not null then update public.works set remixes=greatest(remixes+d,0) where id=r.derived_from; end if;
  return null; end $$;

create function public.comments_rate() returns trigger language plpgsql security definer set search_path='' as $$
begin if (select count(*) from public.comments where user_id=new.user_id and created_at>now()-interval '1 minute')>=5 then raise exception 'rate limit: slow down'; end if; return new; end $$;

create function public.get_work(p_id uuid) returns setof public.works language sql stable security definer set search_path='' as $$
  select * from public.works where id=p_id and ((visibility<>'private' and not hidden) or author_id=auth.uid() or public.is_admin()) $$;
create function public.can_read_payload(p text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.works where payload_path=p and ((visibility<>'private' and not hidden) or author_id=auth.uid() or public.is_admin())) $$;
-- Storage 用ヘルパー。オブジェクト名が「呼び出し元ユーザーID/UUID.json」の形式か（入れ子・別拡張子・他人のIDは不可）
create function public.is_own_payload_name(n text) returns boolean language sql stable set search_path='' as $$
  select auth.uid() is not null and n ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') $$;
-- 作品行が参照中の保存ファイルか（RLSに依存せず判定。参照中のファイルは削除させない）
create function public.payload_in_use(n text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.works where payload_path=n) $$;
-- 管理者用: 作品行が無いまま残った保存ファイル（投稿失敗の削除漏れ等）の一覧。削除は Storage API / ダッシュボードで行う
create function public.list_orphan_payloads(min_age interval default interval '1 hour') returns table(name text, created_at timestamptz) language sql stable security definer set search_path='' as $$
  select o.name, o.created_at from storage.objects o
  where public.is_admin() and o.bucket_id='works' and o.created_at < now()-min_age
    and not exists(select 1 from public.works w where w.payload_path=o.name) $$;
create function public.trending_works(lim int default 30) returns setof public.works language sql stable set search_path='' as $$
  select w.* from public.works w where w.visibility='public' and not w.hidden
  order by (w.likes*3 + w.comments*2 + w.remixes*4) desc, w.created_at desc limit least(lim,100) $$;
create function public.delete_my_account() returns void language sql security definer set search_path='' as $$ delete from auth.users where id=auth.uid() $$;

create trigger on_auth_user after insert on auth.users for each row execute function public.handle_new_user();
create trigger works_b before insert or update on public.works for each row execute function public.works_before();
create trigger likes_c after insert or delete on public.likes for each row execute function public.bump();
create trigger comments_c after insert or delete on public.comments for each row execute function public.bump();
create trigger remix_c after insert or delete on public.works for each row execute function public.bump();
create trigger comments_r before insert on public.comments for each row execute function public.comments_rate();
revoke all on function public.payload_in_use(text) from public, anon; grant execute on function public.payload_in_use(text) to authenticated;
revoke all on function public.list_orphan_payloads(interval) from public, anon; grant execute on function public.list_orphan_payloads(interval) to authenticated;
revoke all on function public.delete_my_account() from public, anon; grant execute on function public.delete_my_account() to authenticated;

alter table public.profiles enable row level security; alter table public.admins enable row level security; alter table public.works enable row level security;
alter table public.likes enable row level security; alter table public.bookmarks enable row level security; alter table public.follows enable row level security;
alter table public.comments enable row level security; alter table public.reports enable row level security;
create policy p_sel on public.profiles for select using (true);
create policy p_upd on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy w_sel on public.works for select using ((visibility='public' and not hidden) or author_id=auth.uid() or public.is_admin());
create policy w_ins on public.works for insert with check (author_id=auth.uid());
create policy w_upd on public.works for update using (author_id=auth.uid() or public.is_admin()) with check (author_id=auth.uid() or public.is_admin());
create policy w_del on public.works for delete using (author_id=auth.uid() or public.is_admin());
create policy l_sel on public.likes for select using (true);
create policy l_ins on public.likes for insert with check (user_id=auth.uid() and exists(select 1 from public.works w where w.id=work_id));
create policy l_del on public.likes for delete using (user_id=auth.uid());
create policy b_all on public.bookmarks for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy f_sel on public.follows for select using (true);
create policy f_ins on public.follows for insert with check (follower_id=auth.uid());
create policy f_del on public.follows for delete using (follower_id=auth.uid());
create policy c_sel on public.comments for select using ((not hidden and exists(select 1 from public.works w where w.id=work_id)) or user_id=auth.uid() or public.is_admin());
create policy c_ins on public.comments for insert with check (user_id=auth.uid() and exists(select 1 from public.works w where w.id=work_id));
create policy c_upd on public.comments for update using (public.is_admin());
create policy c_del on public.comments for delete using (user_id=auth.uid() or public.is_admin());
create policy r_ins on public.reports for insert with check (reporter_id=auth.uid());
create policy r_sel on public.reports for select using (reporter_id=auth.uid() or public.is_admin());
create policy r_upd on public.reports for update using (public.is_admin());
-- admins: RLS on, no policies => no client access. Grant via SQL editor: insert into public.admins values ('<user uuid>');

insert into storage.buckets(id,name,public,file_size_limit) values ('works','works',false,8388608) on conflict do nothing;
-- Storage: 保存先は「自分のID/UUID.json」のみ。上書き(UPDATE)ポリシーは意図的に作らない（既存ファイルの差し替え・他人のファイルの改変を不可にする）。
create policy s_read on storage.objects for select using (bucket_id='works' and (public.can_read_payload(name) or public.is_own_payload_name(name)));
create policy s_ins on storage.objects for insert to authenticated with check (bucket_id='works' and public.is_own_payload_name(name));
create policy s_del on storage.objects for delete to authenticated using (bucket_id='works' and public.is_own_payload_name(name) and not public.payload_in_use(name));
