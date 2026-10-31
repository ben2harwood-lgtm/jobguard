// CI-B controls are in-memory source mutations; they execute no application code.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { applyUnresolvedBaseline, agreedV3Symbols, V3_SOURCE, createProject, loadRepoProject, checkCommercialIntegrityBoundary, isProtectedRoot } from './commercial-integrity-boundary.mjs';

const root = new URL('..', import.meta.url);
const authority = 'packages/core/src/pricing.ts';
const evaluator = 'evaluateCommercialIntegrityV3';
const forbidden = 'FORBIDDEN_ADVISORY_DEPENDENCY';
const unknown = 'UNRESOLVED_COVERED_EDGE';
const sql = 'FORBIDDEN_ADVISORY_SQL';
const origin = readFileSync(new URL(V3_SOURCE, root), 'utf8');
const base = {
  [V3_SOURCE]: origin,
  'packages/core/package.json': JSON.stringify({ name: '@jobguard/core', exports: { '.': { types: './src/index.ts' } } }),
  'packages/core/src/index.ts': 'export * from "./commercial-integrity-v3.js"; export * from "./money.js";',
  'packages/core/src/money.ts': 'export const money = (n: number) => n;',
  'packages/db/src/ordinary.ts': 'export const read = () => 1;',
  'apps/api/src/ordinary.ts': 'export const read = () => 1;',
  'apps/web/app/page.tsx': 'export default function Page() { return null; }',
  [authority]: 'export const price = 1;',
};
const scan = (extra = {}, inventory = agreedV3Symbols) => checkCommercialIntegrityBoundary(createProject({ ...base, ...extra }), inventory);
const clean = extra => assert.deepEqual(scan(extra), []);
function bites(extra, code = forbidden, file = authority) {
  const ds = scan(extra);
  const d = ds.find(x => x.code === code && x.file === file);
  assert.ok(d, JSON.stringify(ds, null, 2));
  assert.ok(d.line > 0 && d.dependency.length > 0 && d.chain.includes(file));
  if (code === unknown) assert.match(d.fingerprint, /^[a-f0-9]{64}$/u);
  else assert.equal('fingerprint' in d, false);
}

test('CI-B01 complete accepted inventory and installed authority discovery', () => {
  assert.equal(agreedV3Symbols.length, 14);
  assert.equal(new Set(agreedV3Symbols.map(x => x.name)).size, 14);
  clean();
  for (const inventory of [[], agreedV3Symbols.slice(1), [...agreedV3Symbols, agreedV3Symbols[0]], [{ file: V3_SOURCE, name: 'guessed' }], null]) {
    assert.ok(scan({}, inventory).some(d => d.code === unknown));
  }
  for (const name of agreedV3Symbols.map(x => x.name)) {
    // Remove every equivalent declaration/export identity, not merely a barrel key.
    bites({ [V3_SOURCE]: origin.replaceAll(name, `removed_${name}`) }, unknown, V3_SOURCE);
  }
  const p = loadRepoProject();
  for (const file of ['packages/core/src/fee.ts', 'packages/core/src/plan-entitlements.ts', 'packages/db/src/meter-repository.ts', 'packages/db/src/account-repository.ts', 'apps/api/src/subscription.application.ts']) assert.ok(p.roots.includes(file), file);
});

test('CI-B01 exact integrated source has zero violations, unbaselined edges and stale entries', () => {
  const ds = checkCommercialIntegrityBoundary(loadRepoProject(), agreedV3Symbols);
  for (const code of [forbidden, sql, unknown, 'STALE_UNRESOLVED_BASELINE', 'INVALID_UNRESOLVED_BASELINE']) assert.equal(ds.filter(d => d.code === code).length, 0, code);
  assert.equal(ds.length, 0, `Source proof HOLD: ${ds.length} diagnostics. Run node tools/commercial-integrity-boundary.mjs for full paths.`);
});

for (const [label, body] of [
  ['direct', `${evaluator}()`], ['renamed', 'run()'], ['namespace dot', `advice.${evaluator}()`],
  ['namespace literal', `advice["${evaluator}"]()`], ['const alias', 'alias()'],
]) test(`CI-B02 ${label} consumption fails`, () => {
  const imports = label.startsWith('namespace') || label === 'const alias' ? 'import * as advice from "./commercial-integrity-v3.js";' : `import { ${evaluator}${label === 'renamed' ? ' as run' : ''} } from "./commercial-integrity-v3.js";`;
  bites({ [authority]: `${imports} ${label === 'const alias' ? `const alias = advice.${evaluator};` : ''} export const price = ${body};` });
});
for (const [label, barrel, name] of [
  ['named alias', `export { ${evaluator} as run } from "./commercial-integrity-v3.js";`, 'run'],
  ['star', 'export * from "./commercial-integrity-v3.js";', evaluator],
  ['default wrapper', `import { ${evaluator} } from "./commercial-integrity-v3.js"; export default () => ${evaluator}();`, 'default'],
]) test(`CI-B02 ${label} through wrapper fails`, () => {
  bites({
    [authority]: 'import { wrap } from "./ordinary.js"; export const price = wrap();',
    'packages/core/src/ordinary.ts': `${name === 'default' ? 'import run' : `import { ${name} as run }`} from "./barrel.js"; export const wrap = () => run();`,
    'packages/core/src/barrel.ts': barrel,
  }, forbidden, name === 'default' ? 'packages/core/src/barrel.ts' : 'packages/core/src/ordinary.ts');
});
for (const x of agreedV3Symbols.filter(x => !/^[A-Z]/u.test(x.name))) test(`CI-B02 public runtime origin ${x.name} cannot enter authority`, () => bites({ [authority]: `import { ${x.name} } from "./commercial-integrity-v3.js"; export const price = ${x.name};` }));

for (const [label, source] of [
  ['safe barrel symbol', 'import { money } from "@jobguard/core"; export const price = money(2);'],
  ['unused advisory import', `import { ${evaluator} } from "@jobguard/core"; export const price = 1;`],
  ['type only', 'import type { CommercialIntegrityV3Result } from "@jobguard/core"; export function price(input: CommercialIntegrityV3Result) { return 1; }'],
  ['lexical shadow', `import { ${evaluator} as advice } from "@jobguard/core"; export const price = (advice: () => number) => advice();`],
  ['comment and text', `// ${evaluator}()\nexport const price = "${evaluator}";`],
]) test(`CI-B03 ${label} is legal`, () => clean({ [authority]: source }));
test('CI-B03 evaluator input direction is safe and UI/read/review consumers are legal', () => clean({
  'packages/core/src/money.ts': 'export const money = (n: number) => n;',
  'apps/web/app/advice.ts': `import { ${evaluator} } from "@jobguard/core"; export const read = ${evaluator};`,
  'packages/db/src/commercial-integrity-v3-repository.ts': `import { ${evaluator} } from "@jobguard/core"; export const read = ${evaluator};`,
  'packages/core/src/unused.test.ts': `import { ${evaluator} } from "./commercial-integrity-v3.js"; export const price = ${evaluator}();`,
  'packages/core/src/__fixtures__/pricing.ts': 'db.query(runtime);',
}));

for (const query of [
  "SELECT result FROM app.command_receipt WHERE command_type='commercial_integrity.review.v3'",
  'SELECT * FROM app.commercial_integrity_v3_feedback',
  'SELECT app.ch6_read_integrity_review()',
  'SELECT result FROM app.command_receipt WHERE command_type=$1',
  'SELECT cr FROM app.command_receipt cr',
]) test(`CI-B04 advisory SQL or unproven receipt projection fails: ${query}`, () => bites({ [authority]: `export const price = () => db.query(${JSON.stringify(query)}, ["commercial_integrity.review.v3"]);` }, query.includes('SELECT cr') ? unknown : sql));
test('CI-B04 SQL through nested ordinary wrapper fails', () => bites({
  [authority]: 'import { read } from "./ordinary.js"; export const price = read();',
  'packages/core/src/ordinary.ts': 'const kind = "commercial_integrity.review.v3"; export const read = () => db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", [kind]);',
}, sql, 'packages/core/src/ordinary.ts'));
for (const query of ['SELECT id FROM app.job', "SELECT result FROM app.command_receipt WHERE command_type='quote.create'", 'SELECT count(*) FROM app.command_receipt', 'SELECT * FROM app.job /* app.commercial_integrity_v3_feedback */']) test(`CI-B04 ordinary SQL stays legal: ${query}`, () => clean({ [authority]: `db.query(${JSON.stringify(query)});` }));
test('CI-B04 static helper and concatenation preserve SQL identity', () => bites({ [authority]: 'const table = "app.commercial_integrity_v3_feedback"; function query(t: string) { return `SELECT * FROM ${t}`; } db.query(query(table));' }, sql));

for (const body of [
  'import * as advice from "./commercial-integrity-v3.js"; advice[key]();',
  'import * as advice from "./commercial-integrity-v3.js"; opaque(advice);',
  'import { missing } from "./absent.js"; missing();',
  'import { missing } from "@jobguard/core/unmapped"; missing();',
  'import { missing } from "./money.js"; missing();',
  'import(path);', 'require(path);', 'eval(code);', 'new Function(code);',
  'db.query(runtime);',
]) test(`CI-B02 unresolved checked edge fails: ${body}`, () => bites({ [authority]: body }, unknown));
for (const token of ['pricing', 'meter', 'fee', 'entitlement', 'subscription', 'activation', 'free-first-job', 'jobs-on-the-go', 'account-status']) test(`CI-B06 nested/new ${token} discovery has no fixed-file exemption`, () => {
  const file = `packages/db/src/new/nested/extra-${token}.ts`;
  assert.ok(isProtectedRoot(file));
  bites({ [file]: `import { ${evaluator} } from "@jobguard/core"; export const enforce = ${evaluator};` }, forbidden, file);
});
test('CI-B05 actual authority-source mutation is detected without executing it', () => {
  const p = loadRepoProject(), file = 'packages/core/src/fee.ts';
  const original = p.texts.get(file);
  assert.ok(original);
  const changed = createProject({ ...Object.fromEntries(p.texts), [file]: original + `\nimport { ${evaluator} as forbiddenAdvice } from "./commercial-integrity-v3.js"; export const newFee = forbiddenAdvice;` });
  assert.ok(checkCommercialIntegrityBoundary(changed).some(d => d.code === forbidden && d.file === file));
});
test('CLI exits zero for repository and exit status agrees with API', () => {
  const result = spawnSync(process.execPath, ['tools/commercial-integrity-boundary.mjs'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(checkCommercialIntegrityBoundary(loadRepoProject()), []);
  assert.match(result.stdout, /protected roots; \d+ diagnostics/u);
});

for (const binding of ['import * as all', 'import { advice as all }']) test(`CI-B02 namespace re-export ${binding} resolves actual origin`, () => {
  const member = binding.includes('*') ? 'all.advice.evaluateCommercialIntegrityV3' : 'all.evaluateCommercialIntegrityV3';
  bites({ [authority]: `${binding} from "./bridge.js"; export const price = ${member}();`,
    'packages/core/src/bridge.ts': 'export * as advice from "./commercial-integrity-v3.js";',
  });
});
test('CI-B02 public error class origin fails', () => bites({ [authority]: 'import { CommercialIntegrityV3Error } from "./commercial-integrity-v3.js"; export const price = new CommercialIntegrityV3Error("INVALID_COMMERCIAL_INTEGRITY_V3_INPUT");' }));
test('CI-B01 missing directories, roots, malformed syntax and load errors fail closed', () => {
  for (const remove of ['apps/web/app/page.tsx', authority, V3_SOURCE]) {
    const files = { ...base }; delete files[remove];
    assert.ok(checkCommercialIntegrityBoundary(createProject(files)).some(x => x.code === unknown));
  }
  bites({ [authority]: 'export const broken = ( ;' }, unknown);
  const p = createProject(base); p.loadErrors.push('some/source.ts: symbolic link');
  assert.ok(checkCommercialIntegrityBoundary(p).some(x => x.dependency.includes('symbolic link')));
});
test('CI-B02 side effect import and executable re-export bridge fail', () => {
  bites({ [authority]: 'import "./commercial-integrity-v3.js";' });
  bites({ [authority]: 'import { money } from "./bridge.js"; money(1);',
    'packages/core/src/bridge.ts': 'export { money } from "./money.js"; import { evaluateCommercialIntegrityV3 } from "./commercial-integrity-v3.js"; evaluateCommercialIntegrityV3();',
  }, forbidden, 'packages/core/src/bridge.ts');
});
test('CI-B04 SQL case and quoted identifiers normalise before comparison', () => bites({ [authority]: 'db.query(\'SELECT * FROM "APP"."COMMERCIAL_INTEGRITY_V3_FEEDBACK"\');' }, sql));
test('CI-B02 literal dynamic imports and require retain origin', () => {
  for (const expression of ['(await import("./commercial-integrity-v3.js")).evaluateCommercialIntegrityV3()', 'require("./commercial-integrity-v3.js").evaluateCommercialIntegrityV3()']) bites({ [authority]: `export const price = async () => ${expression};` });
});
test('CI-B02 mutable aliases cannot become a safe resolution', () => bites({ [authority]: 'import { evaluateCommercialIntegrityV3 } from "./commercial-integrity-v3.js"; let alias = evaluateCommercialIntegrityV3; alias = ordinary; alias();' }, unknown));
test('CI-B05 standard root test discovery still includes tools', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.match(pkg.scripts.test, /node --test tools\/\*\.test\.mjs/u);
});

test('CI-B03 indexing ordinary imported data is not computed module access', () => clean({
  [authority]: 'import { prices } from "./money.js"; export const price = prices[key];',
  'packages/core/src/money.ts': 'export const prices = { one: 1 };',
}));

// r1: paired safe/unsafe controls exercise the finite evaluator before baselining.
for (const [label, safe, unsafe] of [
  ['finite literals', 'db.query(flag ? "SELECT id FROM app.job" : "SELECT id FROM app.quote");', 'db.query(flag ? "SELECT id FROM app.job" : "SELECT * FROM app.commercial_integrity_v3_feedback");'],
  ['immutable constants', 'const table = "app.job"; const query = `SELECT * FROM ${table}`; db.query(query);', 'const table = "app.commercial_integrity_v3_feedback"; const query = `SELECT * FROM ${table}`; db.query(query);'],
  ['static helpers', 'function select(table: string) { return `SELECT * FROM ${table}`; } db.query(select("app.job"));', 'function select(table: string) { return `SELECT * FROM ${table}`; } db.query(select("app.commercial_integrity_v3_feedback"));'],
  ['immutable receipt parameters', 'const kind = "quote.create"; const params = [kind]; db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", params);', 'const kind = "commercial_integrity.review.v3"; const params = [kind]; db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", params);'],
]) test(`r1 static resolution: ${label} proves ordinary SQL and detects advisory SQL`, () => {
  clean({ [authority]: safe });
  bites({ [authority]: unsafe }, sql);
});
for (const source of [
  'let table = "app.job"; table = runtime; db.query(`SELECT * FROM ${table}`);',
  'const params = ["quote.create"]; params[0] = runtime; db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", params);',
  'function select(table: string) { effect(); return `SELECT * FROM ${table}`; } db.query(select("app.job"));',
  'const select = (table: string) => select(table); db.query(select("app.job"));',
]) test(`r1 non-static inputs remain unresolved: ${source}`, () => bites({ [authority]: source }, unknown));

const pin = ds => [...new Map(ds.filter(d => d.code === unknown).map(d => [d.fingerprint, {
  code: d.code, file: d.file, line: d.line, fingerprint: d.fingerprint,
  reason: 'Test fixture: runtime query text is outside the finite evaluator.',
}])).values()];
const unresolvedFixture = 'function helper() { return runtime; } const query = helper(); db.query(query);';
test('r1 baseline permits only exact reviewed unresolved sites; new edge fails', () => {
  const original = scan({ [authority]: unresolvedFixture });
  const baseline = pin(original);
  assert.equal(baseline.length, 1);
  assert.deepEqual(applyUnresolvedBaseline(original, baseline), []);
  const next = scan({ [authority]: unresolvedFixture + ' db.query(otherRuntime);' });
  assert.ok(applyUnresolvedBaseline(next, baseline).some(d => d.code === unknown));
});
test('r1 removed or now-resolved sites make baseline stale', () => {
  const baseline = pin(scan({ [authority]: unresolvedFixture }));
  for (const source of ['', 'db.query("SELECT id FROM app.job");']) {
    const ds = applyUnresolvedBaseline(scan({ [authority]: source }), baseline);
    assert.equal(ds.filter(d => d.code === 'STALE_UNRESOLVED_BASELINE').length, 1);
  }
});
test('r1 baseline never masks a confirmed violation, even at a pinned site', () => {
  const baseline = pin(scan({ [authority]: unresolvedFixture }));
  const changed = scan({ [authority]: unresolvedFixture.replace('return runtime', 'return "SELECT * FROM app.commercial_integrity_v3_feedback"') });
  const ds = applyUnresolvedBaseline(changed, baseline);
  assert.ok(ds.some(d => d.code === sql));
  assert.ok(ds.some(d => d.code === 'STALE_UNRESOLVED_BASELINE'));
  // Even a forged baseline matching a violation fingerprint cannot suppress it.
  const forged = { ...changed.find(d => d.code === sql), fingerprint: baseline[0].fingerprint };
  assert.ok(applyUnresolvedBaseline([forged], baseline).some(d => d.code === sql));
});
test('r1 fingerprints bind statement, unresolved helper and transitive declarations', () => {
  const source = 'const upstream = runtime; function helper() { return upstream; } const query = helper(); db.query(query);';
  const original = scan({ [authority]: source }), baseline = pin(original);
  for (const changed of [source.replace('runtime', 'otherRuntime'), source.replace('return upstream', 'return opaque(upstream)'), source.replace('db.query(query)', 'db.query(query, args)')]) {
    const ds = applyUnresolvedBaseline(scan({ [authority]: changed }), baseline);
    assert.ok(ds.some(d => d.code === unknown));
    assert.ok(ds.some(d => d.code === 'STALE_UNRESOLVED_BASELINE'));
  }
  // Line movement and unrelated declarations do not freeze the entire module.
  assert.deepEqual(applyUnresolvedBaseline(scan({ [authority]: '\nconst unrelated = 1;\n' + source }), baseline), []);
});
test('r1 invalid, duplicate and violation-shaped baselines fail closed', () => {
  const ds = scan({ [authority]: unresolvedFixture }), baseline = pin(ds);
  for (const bad of [{}, [baseline[0], baseline[0]], [{ ...baseline[0], reason: '' }], [{ ...baseline[0], fingerprint: 'bad' }], [{ ...baseline[0], code: sql }]]) {
    const result = applyUnresolvedBaseline(ds, bad);
    assert.ok(result.some(d => d.code === 'INVALID_UNRESOLVED_BASELINE'));
    assert.ok(result.some(d => d.code === unknown));
  }
});
test('r1 real-source baseline has exactly one entry per remaining site', () => {
  const p = loadRepoProject(), ds = checkCommercialIntegrityBoundary(p, agreedV3Symbols, { baseline: null });
  assert.equal(ds.filter(d => d.code !== unknown).length, 0);
  const sites = new Set(ds.map(d => JSON.stringify([d.file, d.fingerprint])));
  assert.equal(p.unresolvedBaseline.length, sites.size);
  assert.ok(p.unresolvedBaseline.every(e => sites.has(JSON.stringify([e.file, e.fingerprint])) && e.reason.trim()));
});

test('r1 missing, malformed and null on-disk baselines cannot disable the guard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ch6-b-baseline-'));
  try {
    for (const [file, source] of Object.entries(base)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    mkdirSync(join(dir, 'tools'));
    for (const content of [undefined, 'null', '{}', '{']) {
      if (content !== undefined) writeFileSync(join(dir, 'tools/commercial-integrity-boundary.unresolved.json'), content);
      assert.ok(checkCommercialIntegrityBoundary(loadRepoProject(dir)).some(d => d.code === 'INVALID_UNRESOLVED_BASELINE'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const relation of ['ch6_identifier_assertion','ch6_line_correction_source','ch6_integrity_sources']) test(`CH-6 new source ${relation} cannot enter a pricing/meter/fee authority`, () => {
 bites({ [authority]: `db.query("SELECT * FROM app.${relation}");` }, sql);
});
