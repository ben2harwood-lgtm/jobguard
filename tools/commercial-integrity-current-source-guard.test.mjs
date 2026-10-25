// CH6-CSG-01: finite installed-v1 architecture controls. Fictional bad sources
// remain in memory; no provider, query, inspected module, or database is executed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createProject, loadRepoProject, checkCommercialIntegrityBoundary, applyUnresolvedBaseline } from "./commercial-integrity-current-source-guard.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const ORIGIN = "packages/core/src/commercial-integrity.ts";
const AUTHORITY = "packages/core/src/pricing.ts";
const FORBIDDEN = "FORBIDDEN_ADVISORY_DEPENDENCY";
const SQL = "FORBIDDEN_ADVISORY_SQL";
const UNKNOWN = "UNRESOLVED_COVERED_EDGE";
const anchors = {
  [ORIGIN]: "export interface CommercialIntegrityFinding { label: string }; export const evaluateCommercialIntegrity = () => []; export default evaluateCommercialIntegrity;",
  "packages/db/src/commercial-integrity-repository.ts": "export const getCommercialIntegrityReviewQueue = () => [];",
  "packages/db/src/commercial-integrity-application-repository.ts": "export class CommercialIntegrityApplicationRepository {}",
  "apps/api/src/commercial-integrity.application.ts": "export class CommercialIntegrityApplication {}",
  "apps/api/src/commercial-integrity.contracts.ts": "export const integrityReviewV1 = {}; export const ordinary = 1;",
};
const manifest = name => JSON.stringify({ name, exports: { ".": { types: "./src/index.ts" }, "./money": { types: "./src/money.ts" } } });
const base = {
  ...anchors,
  "packages/core/package.json": manifest("@jobguard/core"),
  "packages/db/package.json": manifest("@jobguard/db"),
  "packages/core/src/index.ts": 'export * from "./money.js"; export * from "./commercial-integrity.js";',
  "packages/core/src/money.ts": "export const money = (n: number) => n;",
  "packages/db/src/index.ts": 'export * from "./commercial-integrity-repository.js";',
  "packages/db/src/money.ts": "export const money = (n: number) => n;",
  "apps/web/app/page.tsx": "export default function Page() { return null; }",
  [AUTHORITY]: "export const price = 1;",
};
const diagnostics = extra => checkCommercialIntegrityBoundary(createProject({ ...base, ...extra }));
function violation(extra, code = FORBIDDEN, file = AUTHORITY, dependency) {
  const actual = diagnostics(extra);
  const found = actual.find(d => d.code === code && d.file === file);
  assert.ok(found, `Expected ${code} at ${file}: ${JSON.stringify(actual, null, 2)}`);
  assert.ok(Number.isInteger(found.line) && found.line > 0);
  assert.equal(typeof found.dependency, "string");
  assert.ok(found.dependency.length > 0);
  const chain = JSON.stringify(found.chain);
  assert.ok(chain.includes(file), `Offending file absent from chain: ${chain}`);
  if (dependency) assert.ok(`${found.dependency} ${chain}`.includes(dependency), JSON.stringify(found));
  return actual;
}
const clean = extra => assert.deepEqual(diagnostics(extra), []);

function sourceFiles(dir, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, result);
    else if (/\.(?:ts|tsx|mts|cts)$/u.test(entry.name)) result.push(relative(root, path).split("\\").join("/"));
  }
  return result;
}

test("CSG-01 installed repository has real origins and nonempty nested authority roots, and must have zero confirmed, unbaselined or stale diagnostics for PASS", () => {
  const files = ["packages/core/src", "packages/db/src", "apps/api/src", "apps/web/app"].flatMap(p => sourceFiles(join(root, p)));
  for (const path of Object.keys(anchors)) assert.ok(files.includes(path), path);
  for (const path of ["packages/core/src/fee.ts", "packages/db/src/account-repository.ts", "apps/api/src/effects/fee-posting.ts"]) assert.ok(files.includes(path), path);
  assert.ok(files.filter(p => /(?:^|\/)(?:.*[-.])?(?:fee|pricing|subscription)(?:[-.]|\.ts$)/u.test(p)).length > 0);
  const project = loadRepoProject(root);
  assert.ok(project.roots.length > 0, "scanner must discover real authority roots");
  assert.ok(project.roots.includes("packages/db/src/account-repository.ts"));
  assert.deepEqual(checkCommercialIntegrityBoundary(project), []);
});

test("CSG-01 missing anchor, missing directory and malformed executable source fail closed", () => {
  for (const remove of [ORIGIN, "apps/web/app/page.tsx"]) {
    const files = { ...base }; delete files[remove];
    assert.ok(checkCommercialIntegrityBoundary(createProject(files)).some(d => d.code === UNKNOWN), remove);
  }
  violation({ [AUTHORITY]: "export const broken = ( ;" }, UNKNOWN);
  assert.ok(checkCommercialIntegrityBoundary(createProject({})).some(d => d.code === UNKNOWN));
});

for (const [name, source] of [
  ["direct", 'import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; export const price = evaluateCommercialIntegrity();'],
  ["renamed", 'import { evaluateCommercialIntegrity as advice } from "./commercial-integrity.js"; export const price = advice();'],
]) test(`CSG-02 ${name} evaluator runtime use is rejected`, () => violation({ [AUTHORITY]: source }, FORBIDDEN, AUTHORITY, ORIGIN));

for (const [name, barrel] of [
  ["aliased", 'export { evaluateCommercialIntegrity as run } from "./commercial-integrity.js";'],
  ["default", 'export { default as run } from "./commercial-integrity.js";'],
  ["star", 'export * from "./commercial-integrity.js";'],
]) test(`CSG-03 ${name} wrapper and barrel laundering is rejected`, () => {
  const symbol = name === "star" ? "evaluateCommercialIntegrity" : "run";
  violation({
    [AUTHORITY]: 'import { wrap } from "./innocent.js"; export const price = wrap();',
    "packages/core/src/innocent.ts": `import { ${symbol} } from "./barrel.js"; export const wrap = () => ${symbol}();`,
    "packages/core/src/barrel.ts": barrel,
  }, FORBIDDEN, "packages/core/src/innocent.ts", ORIGIN);
});

test("CSG-03 deep wrapper chains and benign cycles terminate while retaining the origin", () => {
  const extra = { [AUTHORITY]: 'import { run } from "./helper0.js"; export const price = run();' };
  for (let i = 0; i < 24; i++) extra[`packages/core/src/helper${i}.ts`] = `export { ${i === 23 ? "evaluateCommercialIntegrity" : "run"} as run } from "./${i === 23 ? "commercial-integrity" : `helper${i + 1}`}.js";`;
  violation(extra, FORBIDDEN, AUTHORITY, ORIGIN);
  clean({
    [AUTHORITY]: 'import { a } from "./a.js"; export const price = a();',
    "packages/core/src/a.ts": 'import { b } from "./b.js"; export const a = () => b();',
    "packages/core/src/b.ts": 'import { a } from "./a.js"; export const b = () => a;',
  });
});

for (const [name, expression] of [["dot", "advice.evaluateCommercialIntegrity()"], ["static element", 'advice["evaluateCommercialIntegrity"]()'], ["immutable alias", "alias()"]]) {
  test(`CSG-04 namespace ${name} use is rejected`, () => violation({ [AUTHORITY]: `import * as advice from "./commercial-integrity.js"; ${name === "immutable alias" ? "const alias = advice.evaluateCommercialIntegrity;" : ""} export const price = ${expression};` }));
}
for (const [name, body] of [
  ["computed namespace", "export const price = advice[key]();"],
  ["namespace escape", "export const price = opaque(advice);"],
  ["reassigned alias", "let alias = advice.evaluateCommercialIntegrity; alias = opaque; export const price = alias();"],
]) test(`CSG-04 ${name} is unresolved`, () => violation({ [AUTHORITY]: `import * as advice from "./commercial-integrity.js"; ${body}` }, UNKNOWN));

test("CSG-04 lexical shadowing does not manufacture an advisory use", () => clean({ [AUTHORITY]: 'import { evaluateCommercialIntegrity as advice } from "./commercial-integrity.js"; export function price(advice: () => number) { return advice(); }' }));
test("CSG-04 competing star exports are unresolved", () => violation({
  [AUTHORITY]: 'import { run } from "./barrel.js"; export const price = run();',
  "packages/core/src/barrel.ts": 'export * from "./a.js"; export * from "./b.js";',
  "packages/core/src/a.ts": "export const run = () => 1;", "packages/core/src/b.ts": "export const run = () => 2;",
}, UNKNOWN));

for (const file of ["packages/core/src/new/nested/new-pricing.ts", "apps/api/src/new/nested/account-status.ts"]) test(`CSG-05 recursive discovery finds ${file}`, () => violation({ [file]: 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const result = evaluateCommercialIntegrity();' }, FORBIDDEN, file, ORIGIN));
test("CSG-05 nested helper query is reached regardless of helper filename", () => violation({
  [AUTHORITY]: 'import { read } from "./deep/ordinary.js"; export const price = read();',
  "packages/core/src/deep/ordinary.ts": 'export const read = () => db.query("select * from app.commercial_integrity_value_fact");',
}, SQL, "packages/core/src/deep/ordinary.ts"));

for (const [name, source] of [
  ["safe barrel symbol", 'import { money } from "@jobguard/core"; export const price = money(1);'],
  ["unused advisory import", 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const price = 1;'],
  ["type-only import", 'import type { CommercialIntegrityFinding } from "./commercial-integrity.js"; export const price = (x: CommercialIntegrityFinding) => 1;'],
  ["inline type-only import", 'import { type CommercialIntegrityFinding } from "./commercial-integrity.js"; export const price = (x: CommercialIntegrityFinding) => 1;'],
  ["comment and string", '// import advice from "./commercial-integrity.js";\nexport const price = "evaluateCommercialIntegrity";'],
]) test(`CSG-06 ${name} passes`, () => clean({ [AUTHORITY]: source }));
test("CSG-06 input direction is not reversed when evaluator imports ordinary money", () => clean({ [ORIGIN]: 'import { money } from "./money.js"; export const evaluateCommercialIntegrity = () => money(1);', [AUTHORITY]: 'import { money } from "./money.js"; export const price = money(2);' }));

test("CSG-07 advisory UI/read/review is legal until an authority root reaches its helper", () => {
  const helper = "apps/web/app/advice.ts";
  const extra = { [helper]: 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const read = () => evaluateCommercialIntegrity();' };
  clean(extra);
  violation({ ...extra, [AUTHORITY]: 'import { read } from "../../../apps/web/app/advice.js"; export const price = read();' }, FORBIDDEN, helper, AUTHORITY);
});

for (const table of ["commercial_integrity_value_fact", "commercial_integrity_activity_fact"]) test(`CSG-08 protected query of ${table} fails`, () => violation({ [AUTHORITY]: `export const price = () => db.query("select * from app.${table}");` }, SQL));
for (const [name, source] of [
  ["nested quoted receipt read", `db.query(${JSON.stringify('WITH r AS (SELECT cr."result" FROM "app"."command_receipt" cr WHERE cr."command_type" = \'commercial_integrity.review\') SELECT * FROM r')})`],
  ["parameter aliased discriminator", 'db.query("SELECT result FROM app.command_receipt WHERE command_type = $1", [kind])'],
  ["star receipt projection", 'db.execute("SELECT * FROM app.command_receipt WHERE command_type = \'commercial_integrity.review\'")'],
  ["joined receipt projection", 'db.query("SELECT cr.result FROM app.job j JOIN app.command_receipt cr ON cr.job_id=j.id WHERE cr.command_type = \'commercial_integrity.review\'")'],
  ["view discriminator", 'db.query("SELECT result FROM app.command_receipt WHERE command_type = \'commercial-integrity-view.v1\'")'],
]) test(`CSG-08 ${name} is forbidden`, () => violation({ [AUTHORITY]: `const family = "commercial_integrity.review"; const kind = family; export const price = () => ${source};` }, SQL));

test("CSG-08 receipt result without provable non-advisory discriminator is unresolved", () => violation({ [AUTHORITY]: 'export const price = () => db.query("select result from app.command_receipt where command_type = $1", [runtimeKind]);' }, UNKNOWN));
for (const [name, body] of [
  ["ordinary job", 'db.query("select * from app.job where id = $1", [jobId])'],
  ["proven different command family", 'db.query("select result from app.command_receipt where command_type = $1", ["quote.create"])'],
  ["SQL comments", 'db.query("select * from app.job /* app.commercial_integrity_value_fact */ -- commercial_integrity.review\\n")'],
  ["immutable concatenated query", 'db.query(sqlText, [jobId])'],
]) test(`CSG-08 ${name} passes`, () => clean({ [AUTHORITY]: `const part = "select * "; const sqlText = part + "from app.job where id = $1"; export const price = () => ${body};` }));
test("CSG-08 SQL tagged template advisory fact is forbidden", () => violation({ [AUTHORITY]: 'export const price = () => sql`SELECT * FROM app.commercial_integrity_activity_fact`;' }, SQL));

for (const [name, body] of [
  ["missing module", 'import { run } from "./missing.js"; export const price = run();'],
  ["missing binding", 'import { absent } from "./money.js"; export const price = absent();'],
  ["unsupported workspace subpath", 'import { run } from "@jobguard/core/unmapped"; export const price = run();'],
  ["dynamic import", "export const price = () => import(runtimePath);"],
  ["dynamic require", "export const price = () => require(runtimePath);"],
  ["dynamic query", "export const price = () => db.query(runtimeQuery, [tenantId]);"],
  ["eval loader", "export const price = () => eval(runtimeSource);"],
  ["Function loader", 'export const price = () => new Function("return import(x)");'],
  ["root escape", 'import { run } from "../../../../../../outside.js"; export const price = run();'],
]) test(`CSG-09 covered ${name} fails closed`, () => violation({ [AUTHORITY]: body }, UNKNOWN));
test("CSG-09 unrelated UI dynamic loading is outside the authority slice", () => clean({ "apps/web/app/dynamic.ts": "export const load = () => import(runtimePath);" }));
test("CSG-09 literal dynamic import resolves to an advisory origin", () => violation({ [AUTHORITY]: 'export const price = async () => (await import("./commercial-integrity.js")).evaluateCommercialIntegrity();' }));
test("CSG-09 literal require resolves to an advisory origin", () => violation({ [AUTHORITY]: 'export const price = () => require("./commercial-integrity.js").evaluateCommercialIntegrity();' }));
test("CSG-09 ambiguous source extension candidates are unresolved", () => violation({ [AUTHORITY]: 'import { run } from "./helper.js"; export const price = run();', "packages/core/src/helper.ts": "export const run = () => 1;", "packages/core/src/helper.tsx": "export const run = () => 2;" }, UNKNOWN));

test("CSG-10 diagnostics are deterministic for permuted inputs and do not mutate source maps", () => {
  const files = { ...base, [AUTHORITY]: 'import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; export const price = evaluateCommercialIntegrity();' };
  const before = JSON.stringify(files);
  const first = checkCommercialIntegrityBoundary(createProject(files));
  const second = checkCommercialIntegrityBoundary(createProject(Object.fromEntries(Object.entries(files).reverse())));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(files), before);
  assert.ok(first.length > 0);
});
test("CSG-10 CLI exit status agrees with API and source files remain byte-identical", () => {
  const paths = ["tools/commercial-integrity-current-source-guard.mjs", "tools/commercial-integrity-current-source-guard.test.mjs", ...Object.keys(anchors)];
  const hashes = () => paths.map(p => createHash("sha256").update(readFileSync(join(root, p))).digest("hex"));
  const before = hashes();
  const actual = checkCommercialIntegrityBoundary(loadRepoProject(root));
  const run = spawnSync(process.execPath, ["tools/commercial-integrity-current-source-guard.mjs"], { cwd: root, encoding: "utf8", timeout: 60_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, actual.length ? 1 : 0, run.stderr + run.stdout);
  assert.deepEqual(hashes(), before);
});

for (const token of ["pricing", "meter", "fee", "entitlement", "entitlements", "subscription", "activation", "free-first-job", "jobs-on-the-go", "account-status"]) {
  test(`CSG-05 finite protected token ${token} matches dot and hyphen boundaries`, () => {
    for (const stem of [token, `new-${token}`, `${token}.application`]) {
      const file = `packages/core/src/deep/${stem}.ts`;
      violation({ [file]: 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const result = evaluateCommercialIntegrity();' }, FORBIDDEN, file);
    }
  });
}
test("CSG-05 token discovery does not match unrelated word substrings or web advice", () => clean({
  "packages/core/src/surfee.ts": 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const advice = evaluateCommercialIntegrity();',
  "apps/web/app/pricing.ts": 'import { evaluateCommercialIntegrity } from "@jobguard/core"; export const advice = evaluateCommercialIntegrity();',
}));
test("CSG-06 safe exact workspace subpath uses manifest types source target", () => clean({ [AUTHORITY]: 'import { money } from "@jobguard/core/money"; export const price = money(1);' }));
test("CSG-06 type position on ordinary import does not create runtime consumption", () => clean({ [AUTHORITY]: 'import { CommercialIntegrityFinding } from "./commercial-integrity.js"; export function price(input: CommercialIntegrityFinding) { return 1; }' }));
test("CSG-09 executable side-effect imports participate in the covered slice", () => violation({ [AUTHORITY]: 'import "./commercial-integrity.js"; export const price = 1;' }));
test("CSG-08 immutable query aliases and literal concatenation retain forbidden table references", () => violation({ [AUTHORITY]: 'const table = "app.commercial_integrity_value_fact"; const text = "select * from " + table; export const price = () => db.query(text);' }, SQL));
test("CSG-08 a discriminator proof applies only to its own query", () => violation({ [AUTHORITY]: 'export const price = () => { db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", ["quote.create"]); return db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", [unknownKind]); };' }, UNKNOWN));
test("CSG-09 unresolved export cycle fails closed rather than resolving to safety", () => violation({
  [AUTHORITY]: 'import { run } from "./loop-a.js"; export const price = run();',
  "packages/core/src/loop-a.ts": 'export { run } from "./loop-b.js";',
  "packages/core/src/loop-b.ts": 'export { run } from "./loop-a.js";',
}, UNKNOWN));

test("CSG-04 reassigned imported function alias is unresolved", () => violation({ [AUTHORITY]: 'import { evaluateCommercialIntegrity as run } from "./commercial-integrity.js"; let alias = run; alias = ordinary; export const price = alias();' }, UNKNOWN));
test("CSG-04 reassigned namespace member alias is unresolved", () => violation({ [AUTHORITY]: 'import * as advice from "./commercial-integrity.js"; let alias = advice.evaluateCommercialIntegrity; alias = ordinary; export const price = alias();' }, UNKNOWN));
test("CSG-03 local export alias cannot launder advisory use", () => violation({
  [AUTHORITY]: 'import { run } from "./local-barrel.js"; export const price = run();',
  "packages/core/src/local-barrel.ts": 'import { evaluateCommercialIntegrity as evaluator } from "./commercial-integrity.js"; const alias = evaluator; export { alias as run };',
}, FORBIDDEN, "packages/core/src/local-barrel.ts", AUTHORITY));
test("CSG-08 receipt OR predicate cannot prove exclusion of advisory records", () => violation({ [AUTHORITY]: 'export const price = () => db.query("SELECT result FROM app.command_receipt WHERE command_type = $1 OR tenant_id = $2", ["quote.create", tenant]);' }, UNKNOWN));
test("CSG-08 lexically shadowed parameter arrays retain the correct discriminator", () => violation({ [AUTHORITY]: 'const parameters = ["quote.create"]; export function price() { const parameters = ["commercial_integrity.review"]; return db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", parameters); }' }, SQL));

test("CSG-10 CLI missing source root exits nonzero with an unresolved diagnostic", () => {
  const missingRoot = join(root, "__ch6_csg_missing_source_root__");
  const run = spawnSync(process.execPath, ["tools/commercial-integrity-current-source-guard.mjs", missingRoot], { cwd: root, encoding: "utf8", timeout: 60_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes(UNKNOWN), run.stderr);
});
test("CSG-05 production declaration, test and fixture files are excluded from traversal", () => clean({
  "packages/core/src/pricing.test.ts": 'import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();',
  "packages/core/src/pricing.spec.mts": 'import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();',
  "packages/core/src/pricing.d.ts": 'export type Hidden = typeof import("./commercial-integrity.js");',
  "packages/core/src/__fixtures__/pricing.ts": 'import { evaluateCommercialIntegrity } from "../commercial-integrity.js"; evaluateCommercialIntegrity();',
  "packages/core/src/__tests__/pricing.ts": 'import { evaluateCommercialIntegrity } from "../commercial-integrity.js"; evaluateCommercialIntegrity();',
}));
for (const [extension, specifier] of [["mts", "mjs"], ["cts", "cjs"], ["tsx", "js"]]) test(`CSG-05 ${extension} production helpers resolve through ${specifier} source counterparts`, () => violation({
  [AUTHORITY]: `import { read } from "./helper.${specifier}"; export const price = read();`,
  [`packages/core/src/helper.${extension}`]: 'import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; export const read = () => evaluateCommercialIntegrity();',
}, FORBIDDEN, `packages/core/src/helper.${extension}`, AUTHORITY));

for (const [name, source] of [
  ["require alias", "const load = require; export const price = () => load(runtimePath);"],
  ["eval alias", "const run = eval; export const price = () => run(runtimeSource);"],
  ["Function alias", "const Compile = Function; export const price = () => new Compile(runtimeSource);"],
]) test(`CSG-09 ${name} cannot hide a covered loader`, () => violation({ [AUTHORITY]: source }, UNKNOWN));

test("CSG-09 literal dynamic import selects advisory symbol through shared barrel", () => violation({ [AUTHORITY]: 'export const price = async () => (await import("@jobguard/core")).evaluateCommercialIntegrity();' }, FORBIDDEN, AUTHORITY, ORIGIN));
test("CSG-09 literal dynamic import selecting safe barrel symbol remains legal", () => clean({ [AUTHORITY]: 'export const price = async () => (await import("@jobguard/core")).money(1);' }));
test("CSG-09 literal require selects advisory symbol through shared barrel", () => violation({ [AUTHORITY]: 'export const price = () => require("@jobguard/core").evaluateCommercialIntegrity();' }, FORBIDDEN, AUTHORITY, ORIGIN));
test("CSG-09 literal require selecting safe barrel symbol remains legal", () => clean({ [AUTHORITY]: 'export const price = () => require("@jobguard/core").money(1);' }));

test("CSG-08 non-advisory discriminator from another SQL statement cannot authorize a receipt read", () => violation({ [AUTHORITY]: 'export const price = () => db.query("SELECT result FROM app.command_receipt; SELECT id FROM app.job WHERE command_type = $1", ["quote.create"]);' }, UNKNOWN));
test("CSG-08 non-advisory discriminator from another joined table cannot authorize a receipt read", () => violation({ [AUTHORITY]: 'export const price = () => db.query("SELECT cr.result FROM app.command_receipt cr JOIN app.job j ON j.id = cr.job_id WHERE j.command_type = $1", ["quote.create"]);' }, UNKNOWN));
test("CSG-08 quoted nested receipt read remains unresolved when its discriminator is elsewhere", () => {
  const query = 'WITH j AS (SELECT id FROM "app"."job" WHERE command_type = $1) SELECT cr."result" FROM "app"."command_receipt" cr JOIN j ON j.id = cr.job_id';
  violation({ [AUTHORITY]: `export const price = () => db.query(${JSON.stringify(query)}, ["quote.create"]);` }, UNKNOWN);
});
test("CSG-08 comments cannot manufacture receipt discriminator proof", () => violation({ [AUTHORITY]: 'export const price = () => db.query("SELECT result FROM app.command_receipt /* WHERE command_type = \'quote.create\' */");' }, UNKNOWN));
test("CSG-08 ordinary query string labels are not advisory record selection", () => clean({ [AUTHORITY]: 'export const price = () => db.query("SELECT \'commercial_integrity.review\' AS label FROM app.job");' }));

 test("CSG-08 receipt count aggregate does not read receipt result or SELECT wildcard", () => clean({ [AUTHORITY]: "export const price = () => db.query(\"SELECT count(*) FROM app.command_receipt WHERE command_type LIKE 'contractor.%'\");" }));

// Actual unchanged-file and lane-diff evidence is recorded in the receipt;
// existing lane CI owns per-branch write permissions. This enduring regression
// checks discovery without permanently freezing unrelated future repository work.
test("CSG-11 root discovery still executes tools and required existing regression entrypoints remain installed", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /node --test tools\/\*\.test\.mjs/);
  assert.match(pkg.scripts.test, /turbo run test/);
  for (const name of ["typecheck", "lint", "build", "openapi:check", "lint:lanes", "test:db", "test:migrations", "test:e2e"]) {
    assert.ok(pkg.scripts[name]?.trim(), `Required check absent: ${name}`);
    assert.doesNotMatch(pkg.scripts[name], /(?:echo|printf).*success|exit 0/);
  }
  for (const file of ["tools/later-shared-money-discovery.test.mjs", "tools/core-purity.test.mjs"]) {
    assert.match(readFileSync(join(root, file), "utf8"), /node:test/);
  }
});

test("CSG-03 intermediate runtime modules retain advisory edges and complete re-export chains", () => {
  const extra = {
    [AUTHORITY]: 'import { money } from "./middle.js"; export const price = money(1);',
    "packages/core/src/middle.ts": 'export { money } from "./money.js"; import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();',
  };
  const ds = violation(extra, FORBIDDEN, "packages/core/src/middle.ts", ORIGIN);
  assert.ok(ds.some(d => d.chain.includes(AUTHORITY)));
  const chain = violation({
    [AUTHORITY]: 'import { run } from "./first.js"; export const price = run();',
    "packages/core/src/first.ts": 'export { run } from "./second.js";',
    "packages/core/src/second.ts": 'export { evaluateCommercialIntegrity as run } from "./commercial-integrity.js";',
  });
  assert.ok(chain.some(d => d.chain.includes("packages/core/src/first.ts") && d.chain.includes("packages/core/src/second.ts")));
});

test("CSG-03 external re-export leaves do not hide runtime references in local intermediate modules", () => violation({
  [AUTHORITY]: 'import { safe } from "./bridge.js"; export const price = safe();',
  "packages/core/src/bridge.ts": 'export { safe } from "external-package"; import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();',
}, FORBIDDEN, "packages/core/src/bridge.ts", ORIGIN));

// Each of the eleven resolved installed cases has both directions exercised.
const fragmentCases = [
  ["extra:135 originColumns", 'const originColumns = "*";', '`SELECT ${originColumns} FROM TABLE`'],
  ["extra:147 nested originColumns", 'const originColumns = "*";', '`WITH x AS (SELECT 1) SELECT ${originColumns} FROM TABLE`'],
  ["extra:193 permission function", 'function allowed(a: number, b: number): string { return `($${a} = $${b})`; }', '`SELECT * FROM TABLE WHERE ${allowed(1, 2)}`'],
  ["extra:206 nested permission function", 'function allowed(a: number, b: number): string { return `($${a} = $${b})`; }', '`WITH x AS (SELECT 1) SELECT * FROM TABLE WHERE ${allowed(2, 3)}`'],
  ["site-visit:139 timestampText", 'const timestampText = (column: string) => `to_char(${column}, "UTC")`;', '`SELECT ${timestampText("started_at")} FROM TABLE`'],
  ["site-visit:144 timestampText", 'const timestampText = (column: string) => `to_char(${column}, "UTC")`;', '`SELECT ${timestampText("completed_at")} FROM TABLE`'],
  ["work-order:125 TENANT_WIDE_IMPORT", 'const TENANT_WIDE_IMPORT = "true";', '`WITH me AS (SELECT ${TENANT_WIDE_IMPORT}) SELECT * FROM TABLE`'],
  ["work-order:176 TENANT_WIDE_IMPORT", 'const TENANT_WIDE_IMPORT = "true";', '`SELECT * FROM TABLE WHERE ${TENANT_WIDE_IMPORT}`'],
  ["work-order:182 permission builder", 'const WIDE = "true"; const visible = (restriction: string) => `SELECT * FROM TABLE WHERE ${WIDE} ${restriction}`;', '`WITH seen AS (${visible("")}) SELECT * FROM seen`'],
  ["work-order:307 permission builder", 'const WIDE = "true"; const visible = (restriction: string) => `SELECT * FROM TABLE WHERE ${WIDE} ${restriction}`;', '`WITH seen AS (${visible("AND id=$1")}) SELECT * FROM seen`'],
  ["work-order:312 COVERED_CLIENTS", 'const COVERED_CLIENTS = "SELECT * FROM TABLE";', '`WITH covered AS (${COVERED_CLIENTS}) SELECT * FROM covered`'],
];
for (const [name, declarations, expression] of fragmentCases) {
  for (const forbidden of [false, true]) test(`r1 ${name} ${forbidden ? "retains forbidden SQL" : "resolves static SQL"}`, () => {
    const source = `${declarations} export const price = () => db.query(${expression});`.replaceAll("TABLE", forbidden ? "app.commercial_integrity_value_fact" : "app.job");
    if (forbidden) violation({ [AUTHORITY]: source }, SQL);
    else clean({ [AUTHORITY]: source });
  });
}
for (const [name, source] of [
  ["runtime argument", 'const fragment = (x: string) => `SELECT * FROM ${x}`; db.query(fragment(runtime));'],
  ["recursive helper", 'function fragment() { return fragment(); } db.query(fragment());'],
  ["mutable helper", 'let fragment = () => "SELECT * FROM app.job"; db.query(fragment());'],
  ["reassigned declaration", 'function fragment() { return "SELECT * FROM app.job"; } fragment = opaque; db.query(fragment());'],
  ["for-of reassignment", 'function fragment() { return "SELECT * FROM app.job"; } for (fragment of replacements) {} db.query(fragment());'],
  ["for-in reassignment", 'function fragment() { return "SELECT * FROM app.job"; } for (fragment in replacements) {} db.query(fragment());'],
  ["side effect body", 'function fragment() { opaque(); return "SELECT * FROM app.job"; } db.query(fragment());'],
  ["written parameter", 'function fragment(x: string) { return x = "SELECT * FROM app.job"; } db.query(fragment("SELECT * FROM app.commercial_integrity_value_fact"));'],
  ["default parameter", 'function fragment(x = opaque()) { return x; } db.query(fragment());'],
  ["async helper", 'const fragment = async () => "SELECT * FROM app.job"; db.query(fragment());'],
  ["lexical shadow", 'const fragment = (x: string) => `SELECT * FROM ${x}`; function price(fragment: unknown) { return db.query(fragment("app.job")); }'],
]) test(`r1 unsupported ${name} stays unresolved`, () => violation({ [AUTHORITY]: source }, UNKNOWN));
test("r1 literal helper arguments retain forbidden receipt discriminator", () => violation({ [AUTHORITY]: 'const kind = (x: string) => x; db.query("SELECT result FROM app.command_receipt WHERE command_type=$1", [kind("commercial_integrity.review")]);' }, SQL));

const entryFor = d => ({ file: d.file, line: d.line, fingerprint: d.fingerprint, reason: "Reviewed finite static-analysis limitation in this fixture", code: d.code });
test("r1 baseline permits only the exact unresolved construct across root chains and line shifts", () => {
  const source = 'db.query(runtimeQuery);';
  const ds = diagnostics({ [AUTHORITY]: source });
  const entries = ds.map(entryFor);
  assert.deepEqual(applyUnresolvedBaseline(ds, entries), []);
  assert.deepEqual(applyUnresolvedBaseline(diagnostics({ [AUTHORITY]: "\n// shifted\n" + source }), entries), []);
  assert.deepEqual(applyUnresolvedBaseline([...ds, { ...ds[0], chain: ["other-root", AUTHORITY] }], entries), []);
});
test("r1 new or changed unresolved edges fail without baseline coverage", () => {
  const ds = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery);' });
  assert.ok(applyUnresolvedBaseline(ds, []).some(d => d.code === UNKNOWN));
  const changed = diagnostics({ [AUTHORITY]: 'db.query(differentQuery);' });
  const result = applyUnresolvedBaseline(changed, ds.map(entryFor));
  assert.ok(result.some(d => d.code === UNKNOWN));
  assert.ok(result.some(d => d.code === "STALE_UNRESOLVED_BASELINE"));
});
test("r1 resolved or deleted constructs fail as stale until baseline shrinks", () => {
  const entries = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery);' }).map(entryFor);
  assert.ok(applyUnresolvedBaseline([], entries).some(d => d.code === "STALE_UNRESOLVED_BASELINE"));
  assert.deepEqual(applyUnresolvedBaseline([], []), []);
});
test("r1 baseline never masks confirmed forbidden SQL or dependencies", () => {
  const ds = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery); db.query("SELECT * FROM app.commercial_integrity_value_fact"); import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();' });
  const entries = ds.filter(d => d.code === UNKNOWN).map(entryFor);
  const remaining = applyUnresolvedBaseline(ds, entries);
  assert.ok(remaining.some(d => d.code === SQL));
  assert.ok(remaining.some(d => d.code === FORBIDDEN));
  for (const code of [SQL, FORBIDDEN]) {
    const invalid = [...entries, { ...entries[0], code }];
    const failures = applyUnresolvedBaseline(ds, invalid);
    assert.ok(failures.some(d => d.code === "INVALID_UNRESOLVED_BASELINE"));
    assert.ok(failures.some(d => d.code === code));
  }
});
test("r1 malformed and duplicate baseline entries fail closed", () => {
  const ds = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery);' });
  const e = entryFor(ds[0]);
  for (const entries of [{}, [e, e], [{ ...e, reason: "" }], [{ ...e, fingerprint: "line:1" }]]) {
    assert.ok(applyUnresolvedBaseline(ds, entries).some(d => d.code === "INVALID_UNRESOLVED_BASELINE"));
  }
});
test("r1 a duplicated unresolved construct needs its own baseline entry", () => {
  const ds = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery);' });
  for (const second of ["db.query(runtimeQuery);", "db.query( runtimeQuery );"]) {
    const doubled = diagnostics({ [AUTHORITY]: `db.query(runtimeQuery); ${second}` });
    assert.equal(new Set(doubled.map(d => d.fingerprint)).size, 2);
    assert.equal(applyUnresolvedBaseline(doubled, ds.map(entryFor)).filter(d => d.code === UNKNOWN).length, 1);
  }
});
test("r1 repository-check API enforces baseline coverage, stale entries and confirmed violations", () => {
  const entries = diagnostics({ [AUTHORITY]: 'db.query(runtimeQuery);' }).map(entryFor);
  const check = source => {
    const project = createProject({ ...base, [AUTHORITY]: source });
    project.unresolvedBaseline = entries;
    return checkCommercialIntegrityBoundary(project);
  };
  assert.deepEqual(check('db.query(runtimeQuery);'), []);
  assert.ok(check('db.query(newRuntimeQuery);').some(d => d.code === UNKNOWN));
  assert.ok(check('export const price = 1;').some(d => d.code === "STALE_UNRESOLVED_BASELINE"));
  const confirmed = check('db.query(runtimeQuery); db.query("SELECT * FROM app.commercial_integrity_value_fact"); import { evaluateCommercialIntegrity } from "./commercial-integrity.js"; evaluateCommercialIntegrity();');
  assert.ok(confirmed.some(d => d.code === SQL));
  assert.ok(confirmed.some(d => d.code === FORBIDDEN));
});

// Independent Claude A/B review repair 1 repros.
for (const [name, sql] of [
  ['to_jsonb', 'SELECT to_jsonb(c) FROM app.command_receipt c WHERE c.command_type=$2'],
  ['row_to_json', 'SELECT row_to_json(c) FROM app.command_receipt c'],
  ['jsonb_agg', 'SELECT (SELECT jsonb_agg(c) FROM app.command_receipt c)'],
  ['bare row', 'SELECT c FROM app.command_receipt c'],
  ['IS FALSE', "SELECT result FROM app.command_receipt WHERE command_type='quote.send' IS FALSE"],
  ['boolean comparison', "SELECT result FROM app.command_receipt WHERE (command_type='quote.send') = false"],
  ['CASE', "SELECT result FROM app.command_receipt WHERE CASE WHEN command_type='quote.send' THEN false ELSE true END"],
]) test(`review repair 1 receipt ${name} fails closed`, () => violation({ [AUTHORITY]: `db.query(${JSON.stringify(sql)});` }, UNKNOWN));
for (const mutation of ['params[0]="commercial_integrity.review";', 'params.splice(0,1,"commercial_integrity.review");', 'opaque(params);']) {
  test(`review repair 1 mutable or escaped array ${mutation}`, () => violation({ [AUTHORITY]: `const params=["quote.send"]; ${mutation} db.query("SELECT result FROM app.command_receipt WHERE command_type=$1",params);` }, UNKNOWN));
}
test('review repair 1 spread parameters cannot prove ordinal', () => violation({ [AUTHORITY]: 'db.query("SELECT result FROM app.command_receipt WHERE command_type=$2",[...lead,"quote.send"]);' }, UNKNOWN));
for (const helper of ['claim', 'readReceipt', 'dispatch']) test(`review repair 1 advisory literal at new ${helper} call cannot borrow baseline`, () => {
  const source=`function ${helper}(type: string) { db.query("SELECT result FROM app.command_receipt WHERE command_type=$1",[type]); }`;
  const entries=diagnostics({[AUTHORITY]:source}).map(entryFor);
  const ds=diagnostics({[AUTHORITY]:source+`${helper}("commercial_integrity.review");`});
  assert.ok(applyUnresolvedBaseline(ds,entries).some(d=>d.code===SQL));
});
for (const declaration of ['const sql = runtime;', 'function sql() { return runtime; }']) test(`review repair 1 fingerprints bind feeding declaration ${declaration}`, () => {
  const source=`${declaration} function price() { db.query(${declaration.startsWith('const')?'sql':'sql()'}); }`;
  const entries=diagnostics({[AUTHORITY]:source}).map(entryFor);
  const changed=diagnostics({[AUTHORITY]:source.replace('runtime','otherRuntime')});
  const remaining=applyUnresolvedBaseline(changed,entries);
  assert.ok(remaining.some(d=>d.code===UNKNOWN));
  assert.ok(remaining.some(d=>d.code==='STALE_UNRESOLVED_BASELINE'));
});
for (const bad of [false,true]) test(`review repair 1 finite ternaries and literal defaults ${bad}`,()=>{
  const source=`function owned(p="$3") { return \`SELECT * FROM ${bad?'app.commercial_integrity_activity_fact':'app.job'} WHERE id=\${p}\`; } const table=kind?"app.job":"app.job"; const sql=owned()+(kind?"":" UNION SELECT * FROM "+table); db.query(sql);`;
  if(bad) violation({[AUTHORITY]:source},SQL); else clean({[AUTHORITY]:source});
});
test('review repair 1 decorated constructor emits runtime advisory dependency',()=>violation({
  'apps/api/src/subscription.application.ts':'import { CommercialIntegrityApplication } from "./commercial-integrity.application.js"; @Injectable() export class SneakyFee { constructor(private readonly integrity: CommercialIntegrityApplication) {} fee(j) { return this.integrity.view(j); } }',
},FORBIDDEN,'apps/api/src/subscription.application.ts'));
// Reproduce edits at the exact installed sites without executing modified code.
for (const [file, before, after] of [
  ['apps/api/src/practice-access.ts','"app.evidence_upload"','"app.commercial_integrity_value_fact"'],
  ['apps/api/src/practice-access.ts','SELECT id FROM app.evidence_object WHERE',"SELECT result AS id FROM app.command_receipt WHERE command_type='commercial_integrity.review' AND"],
  ['packages/db/src/practice-session.ts','SELECT id FROM app.job WHERE','SELECT id FROM app.commercial_integrity_activity_fact WHERE'],
  ['packages/db/src/practice-session.ts','JOIN app.recovery_case c', 'JOIN app.commercial_integrity_activity_fact c'],
  ['packages/db/src/practice-session.ts',' SELECT id FROM practice_owned_job WHERE'," SELECT result FROM app.command_receipt WHERE command_type='commercial_integrity.review' AND"],
]) test(`review repair 1 installed mutation ${file} ${after}`,()=>{
  const project=loadRepoProject(root), original=project.texts.get(file);
  assert.ok(original.includes(before));
  const changed=createProject({...Object.fromEntries(project.texts),[file]:original.replace(before,after)});
  const ds=checkCommercialIntegrityBoundary(changed,{baseline:project.unresolvedBaseline});
  assert.ok(ds.some(d=>d.code===SQL),JSON.stringify(ds));
});
for (const [name, prefix, binding] of [
  ['undecorated', '', 'import'], ['explicit type import', '@Injectable()', 'import type'],
]) test(`review repair 1 ${name} constructor remains erased`,()=>clean({
  'apps/api/src/subscription.application.ts':`${binding} { CommercialIntegrityApplication } from "./commercial-integrity.application.js"; ${prefix} export class Fee { constructor(private readonly integrity: CommercialIntegrityApplication) {} }`,
}));
test('review repair 1 decorated constructor safe dependency stays legal',()=>clean({
  'apps/api/src/subscription.application.ts':'import { money } from "@jobguard/core"; @Injectable() export class Fee { constructor(private readonly ordinary: money) {} }',
}));
test('review repair 1 exact installed subscription injection repro',()=>{
  const p=loadRepoProject(root), file='apps/api/src/subscription.application.ts';
  const source=p.texts.get(file)+'\nimport { CommercialIntegrityApplication as Integrity } from "./commercial-integrity.application.js"; @Injectable() class SneakyFee { constructor(private readonly integrity: Integrity) {} fee(j) { return this.integrity.view(j); } }';
  const ds=checkCommercialIntegrityBoundary(createProject({...Object.fromEntries(p.texts),[file]:source}),{baseline:p.unresolvedBaseline});
  assert.ok(ds.some(d=>d.code===FORBIDDEN));
});
for(const sql of ['SELECT (SELECT 1 FROM app.job), c FROM app.command_receipt c', 'SELECT to_jsonb(app.command_receipt) FROM app.command_receipt']) test(`review repair 1 row projection ${sql}`,()=>violation({[AUTHORITY]:`db.query(${JSON.stringify(sql)});`},UNKNOWN));
test('review repair 1 every fixed ternary alternative is inspected',()=>violation({[AUTHORITY]:'const table=flag?"app.job":"app.commercial_integrity_value_fact"; db.query(`SELECT * FROM ${table}`);'},SQL));
