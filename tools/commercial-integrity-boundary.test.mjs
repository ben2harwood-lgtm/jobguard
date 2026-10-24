// CI-B controls are in-memory source mutations; they execute no application code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { agreedV3Symbols, V3_SOURCE, createProject, loadRepoProject, checkCommercialIntegrityBoundary, isProtectedRoot } from './commercial-integrity-boundary.mjs';

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
  assert.equal('fingerprint' in d, false);
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

test('CI-B01 exact integrated source must have no forbidden or unresolved paths', () => {
  const ds = checkCommercialIntegrityBoundary(loadRepoProject(), agreedV3Symbols);
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
test('CLI fails with diagnostics and exit status agrees with API; no source hash assertions', () => {
  const result = spawnSync(process.execPath, ['tools/commercial-integrity-boundary.mjs'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, checkCommercialIntegrityBoundary(loadRepoProject()).length ? 1 : 0);
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
