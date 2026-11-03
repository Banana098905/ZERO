const { load, test, summary, assert } = require('./helpers');
const ZS = load('zs-util.js', 'zs-schema.js', 'zs-store.js');
const U = ZS.util, S = ZS.schema;
const mk = (o) => S.newProject(Object.assign({ engine: 'code', workType: 'web', title: '無題', payload: { html: '', css: '', js: '' } }, o));

(async () => {
console.log('# util / schema / store');

await test('ID: 同名プロジェクト1000件でも重複しない', () => {
  const ids = new Set(); for (let i = 0; i < 1000; i++) ids.add(mk({ title: '同じ名前' }).id);
  assert.strictEqual(ids.size, 1000);
});
await test('ID: 形式は ID_RE に合う', () => { assert.ok(S.ID_RE.test(U.newId('zsp'))); });
await test('ID: 乱数が同じ値を返し続けても上書きせず、有限回で失敗する', async () => {
  const same = () => new Uint8Array(17).fill(7);
  const taken = U.newId('zsp', same);
  await assert.rejects(() => U.uniqueId('zsp', id => id === taken, same), e => e.code === 'STORAGE');
});
await test('ID: 1回だけ衝突しても次の乱数で解決する', async () => {
  let n = 0; const rng = () => new Uint8Array(17).fill(n++ === 0 ? 1 : 2 + n);
  const first = U.newId('zsp', () => new Uint8Array(17).fill(1));
  const id = await U.uniqueId('zsp', x => x === first, rng);
  assert.notStrictEqual(id, first);
});
await test('deepClean: __proto__ / constructor を除去しプロトタイプを汚染しない', () => {
  const evil = JSON.parse('{"a":1,"__proto__":{"polluted":true},"constructor":{"x":1},"n":{"__proto__":{"p2":1}}}');
  const st = {}; const c = U.deepClean(evil, {}, st);
  assert.strictEqual(({}).polluted, undefined); assert.strictEqual(c.a, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(c, '__proto__')); assert.ok(st.dropped >= 3);
});
await test('deepClean: 深すぎる入れ子は TOO_LARGE', () => {
  let o = {}; const root = o; for (let i = 0; i < 100; i++) { o.a = {}; o = o.a; }
  assert.throws(() => U.deepClean(root, { maxDepth: 40 }), e => e.code === 'TOO_LARGE');
});
await test('parseJson: 壊れたJSON・BOM・サイズ超過', () => {
  assert.throws(() => U.parseJson('{broken'), e => e.code === 'INVALID');
  assert.deepStrictEqual(U.parseJson('\uFEFF{"a":1}'), { a: 1 });
  assert.throws(() => U.parseJson('x'.repeat(100), 50), e => e.code === 'TOO_LARGE');
});

await test('schema: 必須項目がすべて入る', () => {
  const p = mk({ title: 'A' });
  for (const k of ['id','title','description','createdAt','updatedAt','engine','workType','projectVersion','engineData','assets','dependencies','derivedFrom','license','visibility','formatVersion'])
    assert.ok(k in p, k + ' がない');
  assert.strictEqual(p.projectVersion, 1); assert.strictEqual(p.derivedFrom, null); assert.strictEqual(p.visibility, 'private');
});
await test('schema: 不正な入力を拒否（配列・null・ID不正・payload無し・formatVersion無し）', () => {
  const good = mk({});
  for (const bad of [null, [], 'x', 5, Object.assign({}, good, { id: 'a b' }), Object.assign({}, good, { engineData: {} }),
    Object.assign({}, good, { engine: 'Bad Engine' }), (({ formatVersion, ...r }) => r)(good)])
    assert.strictEqual(S.sanitizeProject(bad).ok, false);
});
await test('schema: 入力オブジェクトを書き換えない', () => {
  const good = mk({}); const snap = JSON.stringify(good); good.title = 'x'.repeat(500);
  const s2 = JSON.stringify(good); S.sanitizeProject(good); assert.strictEqual(JSON.stringify(good), s2); assert.notStrictEqual(snap, s2);
});
await test('schema: 文字列の上限・制御文字・不正タグ・不正サムネイルを丸める', () => {
  const p = Object.assign({}, mk({}), { title: 'a\u0000b'.padEnd(300, 'z'), tags: ['ok', '<script>', 'a b', 'ok'], thumb: 'javascript:alert(1)' });
  const r = S.sanitizeProject(p); assert.ok(r.ok);
  assert.ok(r.project.title.length <= 80 && !r.project.title.includes('\u0000'));
  assert.deepStrictEqual(r.project.tags, ['ok']); assert.strictEqual(r.project.thumb, undefined); assert.ok(r.warnings.length >= 2);
});
await test('schema: payload の危険キーを除去し警告する', () => {
  const p = Object.assign({}, mk({}), { engineData: { schemaVersion: 1, payload: JSON.parse('{"html":"x","__proto__":{"z":1}}') } });
  const r = S.sanitizeProject(p); assert.ok(r.ok); assert.ok(r.warnings.some(w => /危険/.test(w)));
});
await test('schema: 大きすぎる作品データは拒否', () => {
  const p = Object.assign({}, mk({}), { engineData: { schemaVersion: 1, payload: { html: 'x'.repeat(S.LIMITS.projectBytes + 10) } } });
  assert.strictEqual(S.sanitizeProject(p).ok, false);
});
await test('schema: 未知のエンジン・作品タイプも壊さず保持する（将来のエンジン追加）', () => {
  const p = mk({ engine: 'future-engine', workType: 'hologram', payload: { whatever: [1, 2, { deep: true }] } });
  const r = S.sanitizeProject(JSON.parse(JSON.stringify(p))); assert.ok(r.ok);
  assert.deepStrictEqual(r.project.engineData.payload, { whatever: [1, 2, { deep: true }] });
});
await test('schema: 将来の formatVersion は警告つきで読める範囲だけ取り込む', () => {
  const p = Object.assign({}, mk({}), { formatVersion: 99, newField: 'x' });
  const r = S.sanitizeProject(p); assert.ok(r.ok && r.future); assert.ok(r.warnings.some(w => /新しい版/.test(w)));
  assert.strictEqual(r.project.formatVersion, S.VERSION); assert.strictEqual(r.project.newField, undefined);
});
await test('schema: 移行処理（formatVersion を上げたとき旧データが読める）', () => {
  const old = S.VERSION, oldM = S.migrations; S.VERSION = 2;
  S.migrations = { 1: (r) => Object.assign({}, r, { formatVersion: 2, title: r.title + '(移行)' }) };
  try { const r = S.sanitizeProject(mk0()); assert.ok(r.ok); assert.strictEqual(r.project.title, 'M(移行)'); assert.strictEqual(r.project.formatVersion, 2); }
  finally { S.VERSION = old; S.migrations = oldM; }
  function mk0() { S.VERSION = 1; const p = mk({ title: 'M' }); S.VERSION = 2; return p; }
});
await test('schema: versionHash は内容だけで決まり、タイトル変更では変わらない', () => {
  const a = mk({ title: 'A', payload: { html: '1' } }), b = Object.assign({}, a, { title: 'B' }), c = mk({ payload: { html: '2' } });
  assert.strictEqual(S.versionHash(a), S.versionHash(b)); assert.notStrictEqual(S.versionHash(a), S.versionHash(c));
});
await test('schema: 素材と依存関係・派生元の検証', () => {
  const p = Object.assign({}, mk({}), {
    assets: [{ id: 'zsl_a', version: 2 }, { id: 'bad id' }, { id: 'zsl_a', version: 2 }],
    dependencies: [{ type: 'project', id: 'zsp_x', version: 3 }, { type: 'bogus' }, { type: 'ref', note: 'n', detail: { refs: ['3:0'] } }, { type: 'project' }],
    derivedFrom: { projectId: 'zsp_parent', projectVersion: 4, title: 'P' }
  });
  const r = S.sanitizeProject(p).project;
  assert.deepStrictEqual(r.assets, [{ id: 'zsl_a', version: 2 }]); assert.strictEqual(r.dependencies.length, 2);
  assert.deepStrictEqual(r.derivedFrom, { projectId: 'zsp_parent', projectVersion: 4, title: 'P' });
});
await test('schema: ライブラリ素材の検証', () => {
  const it = S.newLibraryItem({ kind: 'pixel-art', name: 'p', data: { size: 16 } });
  assert.strictEqual(it.version, 1); assert.ok(S.ID_RE.test(it.id));
  assert.strictEqual(S.sanitizeLibraryItem(Object.assign({}, it, { kind: 'BAD KIND' })).ok, false);
  assert.strictEqual(S.sanitizeLibraryItem(Object.assign({}, it, { data: 'str' })).ok, false);
});
await test('schema: 公開用パッケージに完全性ハッシュが付き、online:false', async () => {
  const p = mk({}); const pk = await S.buildPublish(p, []);
  assert.strictEqual(pk.online, false); assert.strictEqual(pk.integrity.hash.length, 64);
  assert.strictEqual(pk.integrity.hash, await U.sha256(JSON.stringify({ project: p, library: [] })));
});
await test('schema: classify', () => {
  assert.strictEqual(S.classify(S.buildFile('project', [mk({})], [])), 'zs-file');
  assert.strictEqual(S.classify({ app: 'playground-zero', format: 3, projects: [] }), 'zero-backup');
  assert.strictEqual(S.classify([1]), 'unknown'); assert.strictEqual(S.classify(null), 'unknown');
});

// ---- store（メモリ）----
await test('store: put/get/all/del と変更通知', async () => {
  const st = await ZS.store.open({ backend: 'memory' }); const seen = [];
  st.onChange((m) => seen.push(m.op + ':' + m.coll));
  const p = mk({}); await st.put('projects', p);
  assert.strictEqual((await st.get('projects', p.id)).title, '無題'); assert.strictEqual((await st.all('projects')).length, 1);
  await st.del('projects', p.id); assert.strictEqual(await st.get('projects', p.id), null);
  assert.deepStrictEqual(seen, ['put:projects', 'del:projects']);
});
await test('store: メモリ保存は参照を共有しない（呼び出し側の変更が混入しない）', async () => {
  const st = await ZS.store.open({ backend: 'memory' }); const p = mk({}); await st.put('projects', p);
  p.title = '変更後'; assert.strictEqual((await st.get('projects', p.id)).title, '無題');
});
await test('store: id の無いレコードは拒否', async () => {
  const st = await ZS.store.open({ backend: 'memory' });
  await assert.rejects(() => st.put('projects', { title: 'x' }), e => e.code === 'INVALID');
});
await test('store: meta の入出力と既定値', async () => {
  const st = await ZS.store.open({ backend: 'memory' });
  assert.strictEqual(await st.getMeta('x', 5), 5); await st.setMeta('x', { a: 1 }); assert.deepStrictEqual(await st.getMeta('x'), { a: 1 });
});
await test('store: 容量不足は QUOTA として日本語で返る', async () => {
  const st = await ZS.store.open({ backend: 'memory' });
  st.repo.put = () => Promise.reject(Object.assign(new Error('x'), { name: 'QuotaExceededError' }));
  await assert.rejects(() => st.put('projects', mk({})), e => e.code === 'QUOTA' && /容量/.test(e.message));
});
await test('store: localStorage 版 — 壊れたデータは上書き前に退避する', async () => {
  const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  try {
    mem['zs1:projects'] = '{this is corrupt';
    const st = new ZS.store.Store(new ZS.store.LocalRepo()); const p = mk({});
    await st.put('projects', p);
    assert.ok(Object.keys(mem).some(k => k.startsWith('zs1:corrupt:projects:')), '退避キーがない');
    assert.strictEqual(mem[Object.keys(mem).find(k => k.startsWith('zs1:corrupt:'))], '{this is corrupt');
    assert.strictEqual((await st.get('projects', p.id)).id, p.id);
  } finally { delete globalThis.localStorage; }
});
await test('store: localStorage 版 — 容量超過は QUOTA', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }, removeItem() {} };
  try { const st = new ZS.store.Store(new ZS.store.LocalRepo()); await assert.rejects(() => st.put('projects', mk({})), e => e.code === 'QUOTA'); }
  finally { delete globalThis.localStorage; }
});

summary('core');
})();
