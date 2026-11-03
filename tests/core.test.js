// Zero 側ロジック: SHA-256 検証 / origin 正規化 / 投稿ロールバック
const assert = require('assert'), crypto = require('crypto');
const Z = require('../js/zero-core.js'), { realPackage } = require('../zerostudio/tests/link-harness');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const clone = o => JSON.parse(JSON.stringify(o));
module.exports = function (t) {
  /* ---- SHA-256 ---- */
  t('verify: ZeroStudio の実出力は検証OK、ハッシュは独立計算と一致', async () => {
    const pk = await realPackage(), v = await Z.verifyPackage(pk); assert.ok(v.ok); assert.strictEqual(v.hash, sha(JSON.stringify({ project: pk.project, library: pk.library }))); });
  t('verify: 改ざん（project / library）を検出', async () => {
    const pk = await realPackage(); let b = clone(pk); b.project.title = '改ざん'; assert.strictEqual((await Z.verifyPackage(b)).code, 'mismatch');
    b = clone(pk); b.project.engineData.payload.js = 'alert(1)'; assert.strictEqual((await Z.verifyPackage(b)).code, 'mismatch');
    b = clone(pk); b.library = [{ id: 'x' }]; assert.strictEqual((await Z.verifyPackage(b)).code, 'mismatch'); });
  t('verify: 欠落（integrity / hash / library）は拒否', async () => {
    const pk = await realPackage(); let b = clone(pk); delete b.integrity; assert.strictEqual((await Z.verifyPackage(b)).code, 'no-integrity');
    b = clone(pk); b.integrity = {}; assert.strictEqual((await Z.verifyPackage(b)).code, 'no-integrity');
    b = clone(pk); delete b.integrity.hash; assert.strictEqual((await Z.verifyPackage(b)).code, 'no-integrity');
    b = clone(pk); b.integrity.hash = ''; assert.strictEqual((await Z.verifyPackage(b)).code, 'no-integrity');
    b = clone(pk); b.integrity = 'abc'; assert.strictEqual((await Z.verifyPackage(b)).code, 'no-integrity');
    b = clone(pk); delete b.library; assert.strictEqual((await Z.verifyPackage(b)).code, 'library'); });
  t('verify: アルゴリズムが SHA-256 以外（SHA-1 / sha-256 / 欠落）は拒否', async () => {
    const pk = await realPackage(); for (const a of ['SHA-1', 'sha-256', 'SHA256', '', null, undefined, 256]) { const b = clone(pk); b.integrity.algorithm = a; if (a === undefined) delete b.integrity.algorithm; assert.strictEqual((await Z.verifyPackage(b)).code, 'algorithm', String(a)); } });
  t('verify: ハッシュ形式が不正（大文字・短い・長い・非16進・非文字列）は拒否', async () => {
    const pk = await realPackage(), h = pk.integrity.hash;
    for (const bad of [h.toUpperCase(), h.slice(1), h + '0', 'g'.repeat(64), ' ' + h, h + '\n', 123, [h]]) { const b = clone(pk); b.integrity.hash = bad; const v = await Z.verifyPackage(b); assert.ok(!v.ok, String(bad)); assert.ok(['hash-format', 'no-integrity'].includes(v.code), v.code); } });
  t('verify: 別の形式・null・配列・projectなしは拒否', async () => {
    for (const bad of [null, undefined, [], 'x', 1, {}, { format: 'zerostudio.publish' }, { format: 'other', project: {}, integrity: {} }]) assert.ok(!(await Z.verifyPackage(bad)).ok); });
  t('validatePkg: エンジン・workType・作品データを検査', async () => {
    const pk = await realPackage(); assert.deepStrictEqual(Z.validatePkg(pk), []); let b = clone(pk); b.project.engine = 'evil'; assert.ok(Z.validatePkg(b).length);
    b = clone(pk); b.project.workType = 'A/../b'; assert.ok(Z.validatePkg(b).length); b = clone(pk); delete b.project.engineData; assert.ok(Z.validatePkg(b).length); });
  t('app.js: 検証OKでない限り投稿ボタンを出さず、投稿直前にも再検証する', () => {
    const app = require('fs').readFileSync('js/app.js', 'utf8'); const i = app.indexOf('Z.verifyPackage(pkg).then(function (v)'); assert.ok(i > 0);
    assert.ok(app.indexOf('if (!v.ok)', i) > 0 && app.indexOf('投稿できません', i) > 0);
    assert.ok(/Z\.verifyPackage\(pkg\)\.then\(function \(v2\) \{ if \(!v2\.ok\) throw/.test(app), '投稿直前の再検証');
    assert.ok(app.indexOf("'公開する'") > app.indexOf('if (!v.ok)'), '公開ボタンは検証OK分岐の中にある'); });

  /* ---- origin 正規化 ---- */
  t('normalizeOrigins: 空は自オリジン、パス付きはオリジンへ、不正は除外（"*"・http・認証情報・文字列以外）', () => {
    const own = 'https://zero.example'; let r = Z.normalizeOrigins([], own); assert.deepStrictEqual(r.origins, [own]); assert.ok(r.usedDefault); assert.deepStrictEqual(Z.normalizeOrigins(undefined, own).origins, [own]);
    r = Z.normalizeOrigins(['https://a.github.io/zerostudio/', 'https://a.github.io', 'https://b.github.io:8443/x?y#z'], own); assert.deepStrictEqual(r.origins, ['https://a.github.io', 'https://b.github.io:8443']);
    r = Z.normalizeOrigins('https://c.github.io/s/', own); assert.deepStrictEqual(r.origins, ['https://c.github.io']);
    r = Z.normalizeOrigins(['*', 'http://evil.example', 'https://u:p@x.example', 'null', 'javascript:1', 42, ''], own); assert.deepStrictEqual(r.origins, []); assert.strictEqual(r.bad.length, 7);
    assert.deepStrictEqual(Z.normalizeOrigins(['http://localhost:8080/'], own).origins, ['http://localhost:8080']);
    assert.deepStrictEqual(Z.normalizeOrigins([], 'null').origins, []); });

  /* ---- 投稿ロールバック ---- */
  const mkDeps = (o) => { o = o || {}; const mem = {}, calls = [], d = { calls, store: { getItem: k => mem[k] || null, setItem: (k, v) => { if (o.storeBroken) throw new Error('quota'); mem[k] = v; }, removeItem: k => { delete mem[k]; } }, mem,
    log: () => {}, sleep: () => Promise.resolve(),
    upload: async (p) => { calls.push('upload'); if (o.upload) throw o.upload; },
    insert: async () => { calls.push('insert'); if (o.insert) throw o.insert; },
    exists: async () => { calls.push('exists'); if (o.existsErr) throw new Error('net'); return !!o.exists; },
    remove: async (p) => { calls.push('remove'); if (o.removeFails === true || (o.removeFails && o.removeFails-- > 0)) throw new Error('rm fail'); } }; return d; };
  const rec = { uid: 'u1', id: 'w1', path: 'u1/w1.json', text: '{}', row: { id: 'w1' } };
  t('rollback: DB登録失敗 → 作品行が無いことを確認して保存ファイルを削除、元のエラーを返す', async () => {
    Z._resetMem(); const d = mkDeps({ insert: Object.assign(new Error('rls'), { status: 403 }) });
    await assert.rejects(Z.uploadAndRegister(d, rec), e => e.message === 'rls' && e.cleanup === 'removed'); assert.deepStrictEqual(d.calls, ['upload', 'insert', 'exists', 'remove']); assert.deepStrictEqual(Z.queue(d), []); });
  t('rollback: 成功時は削除しない', async () => { Z._resetMem(); const d = mkDeps(); const r = await Z.uploadAndRegister(d, rec); assert.ok(r.ok); assert.deepStrictEqual(d.calls, ['upload', 'insert']); });
  t('rollback: アップロード自体が明確に拒否された場合は削除を試みない', async () => {
    Z._resetMem(); const d = mkDeps({ upload: Object.assign(new Error('denied'), { status: 403 }) }); await assert.rejects(Z.uploadAndRegister(d, rec), /denied/); assert.deepStrictEqual(d.calls, ['upload']); });
  t('rollback: 通信断でアップロードの成否が不明なら、存在確認の上で回収する', async () => {
    Z._resetMem(); const d = mkDeps({ upload: new Error('network') }); await assert.rejects(Z.uploadAndRegister(d, rec), e => e.cleanup === 'removed'); assert.deepStrictEqual(d.calls, ['upload', 'exists', 'remove']); });
  t('rollback: 応答が失われただけで作品行が登録済みなら、削除せず成功扱い', async () => {
    Z._resetMem(); const d = mkDeps({ insert: new Error('network'), exists: true }); const r = await Z.uploadAndRegister(d, rec); assert.ok(r.ok && r.recovered); assert.ok(!d.calls.includes('remove')); });
  t('rollback: 作品行の有無を確認できない場合は絶対に削除せず、記録する', async () => {
    Z._resetMem(); const d = mkDeps({ insert: new Error('x'), existsErr: true }); await assert.rejects(Z.uploadAndRegister(d, rec), e => e.cleanup === 'queued'); assert.ok(!d.calls.includes('remove'));
    const q = Z.queue(d); assert.strictEqual(q.length, 1); assert.strictEqual(q[0].path, 'u1/w1.json'); assert.strictEqual(q[0].uid, 'u1'); assert.ok(q[0].at && q[0].error); });
  t('rollback: 削除が失敗したら3回再試行し、失敗を記録。後の sweep で回収して記録を消す', async () => {
    Z._resetMem(); const d = mkDeps({ insert: new Error('db down'), removeFails: true }); await assert.rejects(Z.uploadAndRegister(d, rec), e => e.message === 'db down' && e.cleanup === 'queued');
    assert.strictEqual(d.calls.filter(c => c === 'remove').length, 3); const raw = JSON.parse(d.mem[Z.QUEUE_KEY]); assert.strictEqual(raw.length, 1); assert.strictEqual(raw[0].path, 'u1/w1.json');
    assert.strictEqual(await Z.sweepOrphans(d, 'someone-else'), 0, '他人の記録には触れない'); assert.strictEqual(Z.queue(d).length, 1);
    d.remove = async () => { d.calls.push('remove2'); }; assert.strictEqual(await Z.sweepOrphans(d, 'u1'), 1); assert.deepStrictEqual(Z.queue(d), []); assert.strictEqual(d.mem[Z.QUEUE_KEY], undefined); });
  t('rollback: sweep 時に作品行が存在すれば（実は登録済み）削除せず記録だけ消す', async () => {
    Z._resetMem(); const d = mkDeps({ insert: new Error('x'), existsErr: true }); await assert.rejects(Z.uploadAndRegister(d, rec)); d.exists = async () => true; d.remove = async () => { throw new Error('呼ばれてはならない'); };
    assert.strictEqual(await Z.sweepOrphans(d, 'u1'), 1); assert.deepStrictEqual(Z.queue(d), []); });
  t('rollback: localStorage が使えなくても当セッション中は記録を保持する', async () => {
    Z._resetMem(); const d = mkDeps({ insert: new Error('x'), removeFails: true, storeBroken: true }); await assert.rejects(Z.uploadAndRegister(d, rec), e => e.cleanup === 'queued'); assert.strictEqual(Z.queue(d).length, 1); Z._resetMem(); });
};
