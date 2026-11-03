-- 0002_search_path_hardening.sql — ZERO V1.0.3
-- 目的: SECURITY DEFINER 関数の search_path を空（''）にし、関数・テーブルを public. で修飾する。
--   これまで works_before / bump / comments_rate / get_work / can_read_payload / payload_in_use は search_path='public' だった。
--   定義者権限で動く関数が呼び出し元の search_path に左右されないようにする（関数・テーブルの差し替え対策）。
-- 対象: 0001（V1.0.1 以降の形。is_own_payload_name 等があるもの）を適用済みの既存DB。新規プロジェクトでも 0001 の後に実行して問題ない（冪等）。
-- 変えないもの: テーブル・列・制約・索引・トリガーの定義、RLS の意味、Storage の許可範囲。関数は create or replace（権限 GRANT/REVOKE は維持）、
--   ポリシーは同じ条件のまま関数・テーブル名を修飾して作り直す。全体を1トランザクションで実行するので、途中で失敗すれば何も変わらない。
-- 実行: Supabase SQL Editor に全文を貼って実行（または supabase db push）。実行後は supabase/tests/rls.test.sql を使い捨てDBで実行して確認する。
begin;

-- ===== 1. 関数（0001 と同一の定義。search_path='' ・スキーマ修飾済み） =====
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admins where user_id=auth.uid()) $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,username,display_name) values (new.id, lower(new.raw_user_meta_data->>'username'), left(coalesce(new.raw_user_meta_data->>'username',''),40)); return new; end $$;

create or replace function public.works_before() returns trigger language plpgsql security definer set search_path='' as $$
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

create or replace function public.bump() returns trigger language plpgsql security definer set search_path='' as $$
declare d int := case tg_op when 'INSERT' then 1 else -1 end; r record := case tg_op when 'INSERT' then new else old end;
begin
  if tg_table_name='likes' then update public.works set likes=greatest(likes+d,0) where id=r.work_id;
  elsif tg_table_name='comments' then update public.works set comments=greatest(comments+d,0) where id=r.work_id;
  elsif r.derived_from is not null then update public.works set remixes=greatest(remixes+d,0) where id=r.derived_from; end if;
  return null; end $$;

create or replace function public.comments_rate() returns trigger language plpgsql security definer set search_path='' as $$
begin if (select count(*) from public.comments where user_id=new.user_id and created_at>now()-interval '1 minute')>=5 then raise exception 'rate limit: slow down'; end if; return new; end $$;

create or replace function public.get_work(p_id uuid) returns setof public.works language sql stable security definer set search_path='' as $$
  select * from public.works where id=p_id and ((visibility<>'private' and not hidden) or author_id=auth.uid() or public.is_admin()) $$;
create or replace function public.can_read_payload(p text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.works where payload_path=p and ((visibility<>'private' and not hidden) or author_id=auth.uid() or public.is_admin())) $$;
-- Storage 用ヘルパー。オブジェクト名が「呼び出し元ユーザーID/UUID.json」の形式か（入れ子・別拡張子・他人のIDは不可）
create or replace function public.is_own_payload_name(n text) returns boolean language sql stable set search_path='' as $$
  select auth.uid() is not null and n ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') $$;
-- 作品行が参照中の保存ファイルか（RLSに依存せず判定。参照中のファイルは削除させない）
create or replace function public.payload_in_use(n text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.works where payload_path=n) $$;
-- 管理者用: 作品行が無いまま残った保存ファイル（投稿失敗の削除漏れ等）の一覧。削除は Storage API / ダッシュボードで行う
create or replace function public.list_orphan_payloads(min_age interval default interval '1 hour') returns table(name text, created_at timestamptz) language sql stable security definer set search_path='' as $$
  select o.name, o.created_at from storage.objects o
  where public.is_admin() and o.bucket_id='works' and o.created_at < now()-min_age
    and not exists(select 1 from public.works w where w.payload_path=o.name) $$;
create or replace function public.trending_works(lim int default 30) returns setof public.works language sql stable set search_path='' as $$
  select w.* from public.works w where w.visibility='public' and not w.hidden
  order by (w.likes*3 + w.comments*2 + w.remixes*4) desc, w.created_at desc limit least(lim,100) $$;
create or replace function public.delete_my_account() returns void language sql security definer set search_path='' as $$ delete from auth.users where id=auth.uid() $$;

-- ===== 2. トリガー（関数を public. で修飾して作り直す。トリガー自体の条件は不変） =====
drop trigger if exists on_auth_user on auth.users;
create trigger on_auth_user after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists works_b on public.works;
create trigger works_b before insert or update on public.works for each row execute function public.works_before();
drop trigger if exists likes_c on public.likes;
create trigger likes_c after insert or delete on public.likes for each row execute function public.bump();
drop trigger if exists comments_c on public.comments;
create trigger comments_c after insert or delete on public.comments for each row execute function public.bump();
drop trigger if exists remix_c on public.works;
create trigger remix_c after insert or delete on public.works for each row execute function public.bump();
drop trigger if exists comments_r on public.comments;
create trigger comments_r before insert on public.comments for each row execute function public.comments_rate();

-- ===== 3. 権限（0001 と同じ。create or replace では変わらないが、念のため明示） =====
revoke all on function public.payload_in_use(text) from public, anon; grant execute on function public.payload_in_use(text) to authenticated;
revoke all on function public.list_orphan_payloads(interval) from public, anon; grant execute on function public.list_orphan_payloads(interval) to authenticated;
revoke all on function public.delete_my_account() from public, anon; grant execute on function public.delete_my_account() to authenticated;

-- ===== 4. RLS ポリシー / Storage ポリシー（条件は同じ。関数・テーブルを修飾して作り直す） =====
drop policy if exists p_sel on public.profiles;
drop policy if exists p_upd on public.profiles;
drop policy if exists w_sel on public.works;
drop policy if exists w_ins on public.works;
drop policy if exists w_upd on public.works;
drop policy if exists w_del on public.works;
drop policy if exists l_sel on public.likes;
drop policy if exists l_ins on public.likes;
drop policy if exists l_del on public.likes;
drop policy if exists b_all on public.bookmarks;
drop policy if exists f_sel on public.follows;
drop policy if exists f_ins on public.follows;
drop policy if exists f_del on public.follows;
drop policy if exists c_sel on public.comments;
drop policy if exists c_ins on public.comments;
drop policy if exists c_upd on public.comments;
drop policy if exists c_del on public.comments;
drop policy if exists r_ins on public.reports;
drop policy if exists r_sel on public.reports;
drop policy if exists r_upd on public.reports;
drop policy if exists s_read on storage.objects;
drop policy if exists s_ins on storage.objects;
drop policy if exists s_del on storage.objects;

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

create policy s_read on storage.objects for select using (bucket_id='works' and (public.can_read_payload(name) or public.is_own_payload_name(name)));
create policy s_ins on storage.objects for insert to authenticated with check (bucket_id='works' and public.is_own_payload_name(name));
create policy s_del on storage.objects for delete to authenticated using (bucket_id='works' and public.is_own_payload_name(name) and not public.payload_in_use(name));

commit;
