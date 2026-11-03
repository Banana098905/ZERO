// 静的検査（サンドボックス設定・秘密鍵なし・SQL・ワークフロー・設定ドキュメント）
const assert = require('assert'), fs = require('fs'), crypto = require('crypto'), vm = require('vm');
const rd = f => fs.readFileSync(f, 'utf8'), sha = t => crypto.createHash('sha256').update(t).digest('hex');
module.exports = function (t) {
  t('既存: ZeroStudio の buildPublish と Zero の検証式が一致 / 改ざん検出', async () => {
    const ctx = { console, crypto: crypto.webcrypto, TextEncoder }; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
    ['zs-util', 'zs-schema'].forEach(f => vm.runInContext(rd(`zerostudio/js/${f}.js`), ctx)); const S = ctx.ZS.schema;
    const proj = S.newProject({ engine: 'code', workType: 'web', title: 'テスト', payload: { html: '<h1>hi</h1>', css: '', js: '' }, license: { id: 'CC-BY-4.0' } });
    const pkg = JSON.parse(JSON.stringify(await S.buildPublish(proj, []))); assert.strictEqual(pkg.format, 'zerostudio.publish');
    assert.strictEqual(pkg.integrity.hash, sha(JSON.stringify({ project: pkg.project, library: pkg.library }))); });
  t('既存: iframe は allow-scripts のみ / HTML注入経路なし / 実行ページ・シェルのCSP / 秘密鍵なし', () => {
    const app = rd('js/app.js'), core = rd('js/zero-core.js'), run = rd('run.html'), idx = rd('index.html');
    assert.ok(/sandbox: 'allow-scripts'/.test(app) && !/allow-same-origin/.test(app)); assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(app + core));
    assert.ok(/default-src 'none'/.test(run) && !/connect-src/.test(run)); assert.ok(!/service_role/i.test(rd('js/config.js') + app + core)); assert.ok(/script-src 'self'(?! 'unsafe)/.test(idx));
    assert.ok(idx.indexOf('js/zero-core.js') > 0 && idx.indexOf('js/zero-core.js') < idx.indexOf('js/app.js')); });
  const sql = rd('supabase/migrations/0001_zero.sql'), rls = rd('supabase/tests/rls.test.sql');
  t('SQL: works に payload_path = author_id/id.json の CHECK 制約とトリガー検証、保存先・作品IDは更新不可', () => {
    assert.ok(/constraint works_payload_path_canonical check \(payload_path = author_id::text \|\| '\/' \|\| id::text \|\| '\.json'\)/.test(sql));
    assert.ok(/tg_op='INSERT' then\s+if new\.payload_path is distinct from new\.author_id::text/.test(sql)); assert.ok(/payload_path is immutable/.test(sql) && /id is immutable/.test(sql)); assert.ok(/create unique index works_payload_path_key/.test(sql)); });
  t('SQL: Storage は INSERT/DELETE とも「自分のID/UUID.json」限定、UPDATEポリシーなし、参照中ファイルは削除不可、読み取りは作品の公開状態に準拠', () => {
    const pol = sql.slice(sql.indexOf('create policy s_read')); assert.ok(/s_ins on storage\.objects for insert to authenticated with check \(bucket_id='works' and public\.is_own_payload_name\(name\)\)/.test(pol));
    assert.ok(/s_del on storage\.objects for delete to authenticated using \(bucket_id='works' and public\.is_own_payload_name\(name\) and not public\.payload_in_use\(name\)\)/.test(pol));
    assert.ok(/s_read on storage\.objects for select using \(bucket_id='works' and \(public\.can_read_payload\(name\) or public\.is_own_payload_name\(name\)\)\)/.test(pol));
    assert.ok(!/on storage\.objects for update/.test(sql), 'UPDATE ポリシーを作らない'); assert.ok(!/foldername/.test(sql), '先頭フォルダだけの緩い検証を使わない');
    assert.ok(/can_read_payload\(p text\)[\s\S]*payload_path=p and \(\(visibility<>'private' and not hidden\)/.test(sql)); });
  t('SQL: is_own_payload_name の正規表現を JS で再現し、許可・拒否を確認', () => {
    const m = sql.match(/n ~ \('\^' \|\| auth\.uid\(\)::text \|\| '([^']+)'\)/); assert.ok(m); const tail = m[1], uid = '00000000-0000-0000-0000-0000000000b2', other = '00000000-0000-0000-0000-0000000000a1', u = '3000000a-0000-0000-0000-00000000000b';
    const re = new RegExp('^' + uid + tail); assert.ok(re.test(`${uid}/${u}.json`)); for (const bad of [`${other}/${u}.json`, `${uid}/nested/${u}.json`, `${uid}/${u}.txt`, `${uid}/${u}.json/`, `${uid}/${u.toUpperCase()}.json`, `${uid}/../${other}/${u}.json`, `${uid}/anything.json`, `${uid}/${u}.json\n`, `x${uid}/${u}.json`, `${uid}//${u}.json`])
      assert.ok(!re.test(bad), bad); });
  t('SQL: RLSテストに、他人の保存ファイルを指す INSERT / UPDATE の拒否テストがあり、フィクスチャは正規形式', () => {
    for (const k of ['bob INSERT pointing at alice payload must be rejected', 'bob UPDATE payload_path to alice payload must be rejected', 'payload_path is immutable', 'bob cannot upload into alice folder', 'bob cannot delete alice object', 'alice cannot delete a payload still referenced', 'storage UPDATE is not allowed', 'non-canonical payload_path must be rejected']) assert.ok(rls.includes(k), k);
    const rows = [...rls.matchAll(/\('(10000000-[0-9a-f-]{27})','(0{8}-0{4}-0{4}-0{4}-0{10}a1)','[^']*','code','web',.*?'([0-9a-f-]+\/[0-9a-f-]+\.json)'\)/g)]; const fx = rows.filter(r => /000[123]$/.test(r[1])); assert.strictEqual(fx.length, 3);
    fx.forEach(r => assert.strictEqual(r[3], r[2] + '/' + r[1] + '.json')); assert.ok(/rollback;\s*$/.test(rls)); });
  t('GitHub Actions: 公開ワークフローは両テストを実行し、deploy はテスト成功に依存', () => {
    const y = rd('.github/workflows/pages.yml'); assert.ok(/run: node tests\.js/.test(y)); assert.ok(/run: cd zerostudio && node scripts\/test-all\.js --unit/.test(y));
    assert.ok(/needs: test/.test(y)); assert.ok(!/continue-on-error/.test(y)); assert.ok(y.indexOf('deploy-pages') > y.indexOf('node tests.js') && y.indexOf('upload-pages-artifact') > y.indexOf('needs: test')); });
  t('設定: README に ZS_ZERO_URL / studioOrigins の実際の設定方法がある', () => {
    const r = rd('README.md'); for (const k of ['ZS_ZERO_URL', 'studioOrigins', 'zerostudio/js/zs-config.js', 'js/config.js', 'supabase db push', 'rls.test.sql']) assert.ok(r.includes(k), k);
    assert.ok(/ZS_ZERO_URL/.test(rd('zerostudio/js/zs-config.js')) && /studioOrigins/.test(rd('js/config.js'))); });
};
