-- RLS / Storage / search_path テスト: 使い捨ての Supabase プロジェクトの SQL Editor で、0001_zero.sql と 0002_search_path_hardening.sql の適用後に実行する。最後に rollback。assert が失敗すると例外で止まる。
-- 注意: この環境では実DBで実行できていない。必ず適用先で全文を実行し、エラーが出ないことを確認すること。
begin;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.t','{"username":"alice"}'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@t.t','{"username":"bob"}');
-- 保存先は必ず {author_id}/{work_id}.json
insert into works(id,author_id,title,engine,work_type,license,visibility,sha256,payload_path) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','pub','code','web','CC-BY-4.0','public',repeat('a',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','priv','code','web','CC0-1.0','private',repeat('a',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1','arr','code','web','all-rights-reserved','public',repeat('a',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000003.json');
do $$ declare n int; ok boolean; st text; msg text; begin
  -- 管理者権限で作る場合でも正規形式以外は入らない（CHECK制約）
  ok:=false; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000000a1','x','code','web',repeat('a',64),'a/20.json'); exception when others then ok:=true; end; assert ok,'non-canonical payload_path must be rejected even for superuser';
  set local role anon;
  select count(*) into n from works; assert n=2, 'anon sees only public, got '||n;
  select count(*) into n from get_work('10000000-0000-0000-0000-000000000002'); assert n=0, 'anon cannot get private';
  ok:=false; begin insert into likes values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001'); exception when others then ok:=true; end; assert ok,'anon like must fail';
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  update works set title='x' where id='10000000-0000-0000-0000-000000000001'; get diagnostics n=row_count; assert n=0,'bob cannot edit alice work';
  ok:=false; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path,derived_from) values ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000b2','r','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000008.json','10000000-0000-0000-0000-000000000003'); exception when others then ok:=true; end; assert ok,'remix of all-rights-reserved must fail';
  insert into works(id,author_id,title,engine,work_type,license,sha256,payload_path,derived_from) values ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-0000000000b2','ok remix','code','web','CC-BY-4.0',repeat('b',64),'00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000009.json','10000000-0000-0000-0000-000000000001');
  insert into likes values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001');
  reset role;
  select count(*) into n from works where id='10000000-0000-0000-0000-000000000001' and likes=1 and remixes=1; assert n=1,'counters updated by triggers';
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  update works set hidden=true where id='10000000-0000-0000-0000-000000000009';
  reset role; select count(*) into n from works where id='10000000-0000-0000-0000-000000000009' and hidden; assert n=0,'author cannot self-set hidden';
end $$;

-- ===== works: 他人の保存ファイルを参照する不正な INSERT / UPDATE は拒否される =====
do $$ declare n int; st text; msg text; begin
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  -- INSERT: 自分の作品行が alice の保存ファイルを指す
  st:=null; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000b2','steal','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'); exception when others then get stacked diagnostics st=returned_sqlstate, msg=message_text; end;
  assert st='P0001' and msg like '%payload_path%', 'bob INSERT pointing at alice payload must be rejected: '||coalesce(st,'no error')||' '||coalesce(msg,'');
  -- INSERT: 自分のフォルダでも作品IDと一致しない
  st:=null; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000b2','mismatch','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000012.json'); exception when others then get stacked diagnostics st=returned_sqlstate, msg=message_text; end;
  assert st='P0001' and msg like '%payload_path%', 'bob INSERT with other work id in path must be rejected: '||coalesce(st,'no error');
  -- INSERT: 入れ子・パス操作
  st:=null; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-0000000000b2','nest','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000b2/x/10000000-0000-0000-0000-000000000013.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end;
  assert st='P0001', 'nested payload_path must be rejected: '||coalesce(st,'no error');
  st:=null; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-0000000000b2','trav','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000b2/../00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end;
  assert st='P0001', 'path traversal must be rejected: '||coalesce(st,'no error');
  -- INSERT: alice 名義で投稿（所有者検証）
  st:=null; begin insert into works(id,author_id,title,engine,work_type,sha256,payload_path) values ('10000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-0000000000a1','impersonate','code','web',repeat('b',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000015.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end;
  assert st='42501', 'bob INSERT as alice must be rejected by RLS: '||coalesce(st,'no error');
  -- UPDATE: 自分の作品の保存先を alice の保存ファイルへ向け替える
  st:=null; begin update works set payload_path='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json' where id='10000000-0000-0000-0000-000000000009'; exception when others then get stacked diagnostics st=returned_sqlstate, msg=message_text; end;
  assert st='P0001' and msg like '%payload_path%', 'bob UPDATE payload_path to alice payload must be rejected: '||coalesce(st,'no error')||' '||coalesce(msg,'');
  -- UPDATE: 自分のフォルダ内の別ファイルでも不可（保存先は不変）
  st:=null; begin update works set payload_path='00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000016.json' where id='10000000-0000-0000-0000-000000000009'; exception when others then get stacked diagnostics st=returned_sqlstate; end;
  assert st='P0001', 'payload_path is immutable: '||coalesce(st,'no error');
  -- UPDATE: 作品ID変更で保存先との結び付きを外せない
  st:=null; begin update works set id='10000000-0000-0000-0000-000000000017' where id='10000000-0000-0000-0000-000000000009'; exception when others then get stacked diagnostics st=returned_sqlstate; end;
  assert st='P0001', 'id is immutable: '||coalesce(st,'no error');
  -- UPDATE: alice の作品の保存先を書き換える試み → RLS により対象 0 行
  update works set payload_path='00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000001.json' where id='10000000-0000-0000-0000-000000000001'; get diagnostics n=row_count; assert n=0,'bob cannot touch alice work row';
  -- 通常の更新は引き続き可能
  update works set title='renamed', visibility='unlisted' where id='10000000-0000-0000-0000-000000000009'; get diagnostics n=row_count; assert n=1,'bob can still edit own work';
  reset role;
  select count(*) into n from works where id='10000000-0000-0000-0000-000000000009' and payload_path='00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000009.json' and title='renamed'; assert n=1,'payload_path unchanged after rejected updates';
end $$;

-- ===== Storage（storage.objects）のポリシー =====
insert into storage.objects(bucket_id,name) values
 ('works','00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'), ('works','00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'), ('works','00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json'); -- 公開作品 / 非公開作品 / 作品行の無い残骸
do $$ declare n int; st text; begin
  set local role anon;
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'; assert n=1,'anon reads public work payload';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'; assert n=0,'anon cannot read private payload';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json'; assert n=0,'anon cannot read unreferenced payload';
  st:=null; begin insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000ff.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end; assert st='42501','anon cannot upload: '||coalesce(st,'no error');
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'; assert n=1,'bob reads alice public payload';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'; assert n=0,'bob cannot read alice private payload';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json'; assert n=0,'bob cannot read alice unreferenced payload';
  -- アップロード: 自分の {id}/{uuid}.json のみ
  insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000001.json');
  st:=null; begin insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-000000000002.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end; assert st='42501','bob cannot upload into alice folder: '||coalesce(st,'no error');
  st:=null; begin insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000b2/nested/30000000-0000-0000-0000-000000000003.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end; assert st='42501','nested path rejected: '||coalesce(st,'no error');
  st:=null; begin insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000b2/anything.json'); exception when others then get stacked diagnostics st=returned_sqlstate; end; assert st='42501','non-uuid name rejected: '||coalesce(st,'no error');
  st:=null; begin insert into storage.objects(bucket_id,name) values ('works','00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000004.html'); exception when others then get stacked diagnostics st=returned_sqlstate; end; assert st='42501','non-json extension rejected: '||coalesce(st,'no error');
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000001.json'; assert n=1,'bob reads own unreferenced payload';
  -- 既存ファイルの上書き(UPDATE)は不可（ポリシー無し）
  update storage.objects set name='00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000009.json' where bucket_id='works' and name='00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000001.json'; get diagnostics n=row_count; assert n=0,'storage UPDATE is not allowed';
  update storage.objects set name='00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000009.json' where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'; get diagnostics n=row_count; assert n=0,'bob cannot modify alice object';
  reset role;
  -- 管理者向け: 作品行の無い残骸の一覧（非管理者は空）
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  select count(*) into n from list_orphan_payloads(interval '-1 second'); assert n=0,'non-admin sees no orphan list';
  reset role;
  insert into admins values ('00000000-0000-0000-0000-0000000000a1');
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1"}',true);
  select count(*) into n from list_orphan_payloads(interval '-1 second') where name in ('00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json','00000000-0000-0000-0000-0000000000b2/30000000-0000-0000-0000-000000000001.json'); assert n=2,'admin sees orphan payloads, got '||n;
  select count(*) into n from list_orphan_payloads(interval '-1 second') where name in ('00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json','00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'); assert n=0,'referenced payloads are not orphans';
  reset role;
  delete from admins where user_id='00000000-0000-0000-0000-0000000000a1';
  -- 削除: 他人のファイル・作品行が参照中のファイルは削除不可。残骸は本人のみ削除可
  perform set_config('storage.allow_delete_query','true',true); -- Supabase の直接DELETE保護を解除（テスト用）
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  delete from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json'; get diagnostics n=row_count; assert n=0,'bob cannot delete alice object';
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1"}',true);
  delete from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'; get diagnostics n=row_count; assert n=0,'alice cannot delete a payload still referenced by a work';
  delete from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001.json'; get diagnostics n=row_count; assert n=1,'alice can delete her unreferenced payload';
  reset role;
end $$;

-- ===== V1.0.3: SECURITY DEFINER 関数はすべて search_path が空（0002 の対象）。一覧に出たら 0002 の適用漏れ =====
do $$ declare bad text; begin
  select string_agg(p.proname, ', ') into bad from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and not exists (select 1 from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) c where c ~ '^search_path=(""|)$');
  assert bad is null, 'SECURITY DEFINER functions without an empty search_path: '||coalesce(bad,'');
end $$;

-- ===== V1.0.3: 呼び出し側の search_path が空でも、関数・トリガー・RLS・Storage ポリシーが動く（= 内部で search_path に依存していない） =====
do $$ declare n int; sp text; begin
  sp := current_setting('search_path'); perform set_config('search_path','',true);
  select count(*) into n from public.get_work('10000000-0000-0000-0000-000000000001'); assert n=1, 'get_work works with empty search_path';
  assert public.can_read_payload('00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'), 'can_read_payload works with empty search_path';
  assert not public.payload_in_use('00000000-0000-0000-0000-0000000000a1/ffffffff-0000-0000-0000-000000000000.json'), 'payload_in_use works with empty search_path';
  select count(*) into n from public.trending_works(10); assert n>=1, 'trending_works works with empty search_path';
  -- トリガー: works_before（作成・Remix の検証）/ bump（カウンター）/ comments_rate
  insert into public.works(id,author_id,title,engine,work_type,license,sha256,payload_path) values ('10000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-0000000000a1','sp','code','web','CC-BY-4.0',repeat('c',64),'00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000031.json');
  insert into public.works(id,author_id,title,engine,work_type,license,sha256,payload_path,derived_from) values ('10000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-0000000000b2','sp remix','code','web','CC-BY-4.0',repeat('c',64),'00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000032.json','10000000-0000-0000-0000-000000000031');
  insert into public.comments(work_id,user_id,body) values ('10000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-0000000000b2','c');
  insert into public.likes values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000031');
  select count(*) into n from public.works where id='10000000-0000-0000-0000-000000000031' and remixes=1 and comments=1 and likes=1; assert n=1, 'bump trigger works with empty search_path';
  update public.works set title='sp2' where id='10000000-0000-0000-0000-000000000031'; select count(*) into n from public.works where id='10000000-0000-0000-0000-000000000031' and title='sp2'; assert n=1, 'works_before (update) works with empty search_path';
  -- Remix 検証（all-rights-reserved は他人には不可）が空の search_path でも効く
  declare ok boolean := false; begin
    begin insert into public.works(id,author_id,title,engine,work_type,sha256,payload_path,derived_from) values ('10000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-0000000000b2','x','code','web',repeat('c',64),'00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000033.json','10000000-0000-0000-0000-000000000003'); exception when others then ok := true; end;
    assert ok, 'remix license check works with empty search_path';
  end;
  -- RLS / Storage ポリシー（authenticated, 空の search_path）
  set local role authenticated; perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
  select count(*) into n from public.works where id='10000000-0000-0000-0000-000000000002'; assert n=0, 'RLS hides private work with empty search_path';
  select count(*) into n from public.works where id='10000000-0000-0000-0000-000000000001'; assert n=1, 'RLS shows public work with empty search_path';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000001.json'; assert n=1, 'storage read policy works with empty search_path';
  select count(*) into n from storage.objects where bucket_id='works' and name='00000000-0000-0000-0000-0000000000a1/10000000-0000-0000-0000-000000000002.json'; assert n=0, 'storage read policy hides private payload with empty search_path';
  reset role; perform set_config('search_path', sp, true);
end $$;
rollback;
