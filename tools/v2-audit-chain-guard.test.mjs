import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assess, inV2Scope, inspectAuditChain, report, scanCommands, seedEvidence } from "./v2/audit-chain-guard.mjs";

const path = "packages/db/src/v2-example-repository.ts";
const id = `${path}#ExampleRepository.save`;
const seed = "tools/v2/seed.integration.test.mjs";
// Deliberately broken fixture. This is never imported or executed as app code.
const broken = `class ExampleRepository {
  async save(context, input) {
    return withTenant(pool, context, async database => {
      await database.$client.query("INSERT INTO app.v2_example (command_id) VALUES ($1)", [input.commandId]);
    });
  }
}`;
const audited = broken.replace("[input.commandId]);", `[input.commandId]);
      await appendAuditBatch(database, [{ payload: { references: { commandId: input.commandId } } }]);`);
// Source-only scanner fixture: these declarations are NOT PostgreSQL evidence.
const evidence = `test("audit-chain: ${id}", async () => {
  await repository.save(context, input);
  assert.equal(events.length, 1, "audit-chain: event");
  await repository.save(context, input);
  assert.equal(replayedEvents.length, 1, "audit-chain: replay");
  await assert.rejects(repository.save(context, forcedFailure));
  assert.deepEqual(afterFailure, beforeFailure, "audit-chain: rollback");
});`;
const check = (source, proof = evidence) => assess(scanCommands(path, source), seedEvidence(seed, proof));

test("write with audit and named event/replay/rollback assertions has a review pointer", () => {
  const [result] = check(audited);
  assert.equal(result.id, id);
  assert.equal(result.auditCall, true);
  assert.equal(result.missing, false);
  assert.equal(result.evidence, `${seed}:1`);
});

test("deliberately broken write without audit or evidence fails disposition", () => {
  const [result] = check(broken, "");
  assert.equal(result.auditCall, false);
  assert.equal(result.missing, true);
  assert.match(report({ base: "fixture-base", head: "fixture-head", commands: [result] }), /FAIL: undisposed write pointers/);
});

test("exemption with a reason passes and is printed for reviewer acceptance", () => {
  const [result] = check(broken.replace("  async save", "  // audit-chain: exempt Idempotency helper; owning command appends the business event.\n  async save"), "");
  assert.equal(result.missing, false);
  assert.match(result.exemption, /Idempotency helper/);
  assert.match(report({ commands: [result] }), /EXEMPT \(review required\)/);
  assert.equal(check(broken.replace("  async save", "  // audit-chain: exempt\n  async save"), "")[0].missing, true);
});

test("Astra amendment: audit call alone is insufficient; delegated audit with evidence is allowed", () => {
  assert.equal(check(audited, "")[0].missing, true);
  assert.equal(check(broken)[0].missing, false, "a reviewer, not this scanner, judges the implementation");
  for (const claim of ["event", "replay", "rollback"]) {
    assert.equal(check(audited, evidence.replace(`"audit-chain: ${claim}"`, '"ordinary assertion"'))[0].missing, true, claim);
  }
});

test("evidence must name this command, call it, and place labels on assertions", () => {
  for (const proof of [
    evidence.replace(id, `${path}#OtherRepository.save`),
    evidence.replaceAll("repository.save", "repository.read"),
    evidence.replaceAll("assert.equal", "console.log"),
    evidence.replace('test("audit-chain:', 'test.skip("audit-chain:'),
    evidence.replace("async () =>", "{ skip: true }, async () =>"),
    evidence.replace("test(", "test.todo("),
  ]) assert.equal(check(audited, proof)[0].missing, true);
});

test("skipped suites, runtime skips and unexecuted assertion blocks are not evidence", () => {
  const body = evidence.slice(evidence.indexOf("async () => {") + "async () => {".length, evidence.lastIndexOf("});") - 1);
  for (const proof of [
    `describe.skip("group", () => { ${evidence} });`,
    `describe.todo("group", () => { ${evidence} });`,
    `describe("group", { skip: true }, () => { ${evidence} });`,
    `describe("group", { todo: true }, () => { ${evidence} });`,
    `describe("outer", () => { describe.skip("inner", () => { ${evidence} }); });`,
    `describe("group", t => { t.skip(); ${evidence} });`,
    `describe("group", t => { t.todo(); ${evidence} });`,
    evidence.replace("async () => {", "async t => { t.skip();"),
    evidence.replace("async () => {", "async t => { t.todo();"),
    `test("audit-chain: ${id}", async () => { if (false) { ${body} } });`,
    `test("audit-chain: ${id}", async () => { const never = async () => { ${body} }; });`,
    `if (false) { ${evidence} }`,
    `const never = () => { ${evidence} };`,
  ]) assert.equal(check(audited, proof)[0].missing, true, proof);
  assert.equal(check(audited, `describe("group", () => { ${evidence} });`)[0].missing, false);
  assert.equal(check(audited, `test("audit-chain: ${id}", async () => { { ${body} } });`)[0].missing, false);
});

test("checked routine pointers include SELECT FROM and routines outside verb prefixes", () => {
  for (const sql of [
    "SELECT * FROM app.record_builder_attested_acceptance($1)",
    "SELECT * FROM app.record_practice_customer_receipt($1)",
    "SELECT * FROM app.reverse_practice_customer_receipt($1)",
    "SELECT * FROM app.record_simulated_settlement($1)",
    "SELECT app.connector_machine_command($1)",
    "SELECT app.replace_fee_reservation_book($1)",
    "CALL app.unlisted_operation($1)",
  ]) {
    const commands = scanCommands(path, `async function save() { await db.query(${JSON.stringify(sql)}); }`);
    assert.equal(commands.length, 1, sql);
    assert.deepEqual(commands[0].targets, [`routine:${sql.match(/app\.\w+/u)[0]}`]);
  }
  assert.deepEqual(scanCommands(path, `async function read() {
    await db.query('SELECT app.current_actor(), app.current_tenant(), app.bind_request($1)');
  }`), []);
});

test("real acceptance, practice-invoice and activation checked writes are listed", () => {
  const cases = {
    "acceptance-repository.ts": ["record_builder_attested_acceptance", "record_quote_disposition"],
    "practice-invoice-repository.ts": ["record_practice_customer_receipt", "reverse_practice_customer_receipt"],
    "activation-repository.ts": ["record_simulated_settlement", "switch_job_live"],
  };
  for (const [name, routines] of Object.entries(cases)) {
    const source = readFileSync(new URL(`../packages/db/src/${name}`, import.meta.url), "utf8");
    const targets = scanCommands(`packages/db/src/${name}`, source).flatMap(command => command.targets);
    for (const routine of routines) assert.ok(targets.includes(`routine:app.${routine}`), `${name}: ${routine}`);
  }
});

test("only changed methods are listed, including a change away from the SQL line", () => {
  const source = `class Repo {
    async changed() { const x = 1;
      await client.query('UPDATE app.v2_thing SET x=$1', [x]); }
    async untouched() { await client.query('DELETE FROM app.v2_other'); }
  }`;
  assert.deepEqual(scanCommands(path, source, [[2, 2]]).map(command => command.id), [`${path}#Repo.changed`]);
  assert.deepEqual(scanCommands(path, source, [[5, 5]]), []);
});

test("SQL templates, constants, tagged SQL, quoted tables, ORM and checked SELECT operations are listed", () => {
  const source = `const sqlText = 'INSERT INTO "app"."v2_constant" (id) VALUES ($1)';
    async function save() { await client.query(sqlText); }
    const set = async () => client.query({text: 'UPDATE app.v2_constant SET x=$1'});
    async function remove() { await client.query(\`DELETE FROM app.v2_item WHERE id=\${id}\`); }
    async function orm() { await db.insert(table).values(input); }
    async function tagged() { await db.execute(sql\`INSERT INTO app.v2_item VALUES (1)\`); }
    async function post() { await client.query('SELECT app.post_plan_obligation($1)'); }
    async function read() { await client.query('SELECT * FROM app.v2_item'); }
    async function editor() { await client.query('SELECT app.v2_work_plan_editor($1)'); }
    async function falsePositive() { console.log('INSERT INTO app.v2_item'); /* DELETE FROM app.x */ }
    const hash = value => createHash('sha256').update(value).digest('hex');
  `;
  const commands = scanCommands(path, source);
  assert.deepEqual(commands.map(command => command.id.split("#")[1]), ["save", "set", "remove", "orm", "tagged", "post", "editor"]);
  assert.deepEqual(commands.at(-2).targets, ["routine:app.post_plan_obligation"]);
  assert.deepEqual(commands.at(-1).targets, ["routine:app.v2_work_plan_editor"]);
});

test("watchdog storage helper and ledger SELECT writes remain reviewable, not automatically judged", () => {
  const source = readFileSync(new URL("../packages/db/src/watchdog.ts", import.meta.url), "utf8");
  assert.ok(scanCommands("packages/db/src/watchdog.ts", source).some(command => command.id.endsWith("#storeCommandResult")));
  const ledger = readFileSync(new URL("../packages/db/src/ledger.ts", import.meta.url), "utf8");
  assert.ok(scanCommands("packages/db/src/ledger.ts", ledger).some(command => command.targets.includes("routine:app.post_plan_obligation")));
});

test("payload references version is flagged separately from the audit envelope version", () => {
  const [clean] = check(audited.replace("payload: {", 'version: "audit.v1", payload: {'));
  assert.equal(clean.payloadVersion, false);
  const [flagged] = check(audited.replace("commandId: input.commandId", '"version": "1", commandId: input.commandId'));
  assert.equal(flagged.payloadVersion, true);
  assert.match(report({ commands: [flagged] }), /forbidden version key/);
  assert.equal(check(audited.replace("commandId: input.commandId", '["version"]: "1", commandId: input.commandId'))[0].payloadVersion, true);
  assert.equal(check(audited.replace("async save(context, input) {", 'async save(context, input) { const references = {version: "1"};')
    .replace("references: { commandId: input.commandId }", "references"))[0].payloadVersion, true);
});

// Real #932 stacked pair, verified via GitHub on 25 Nov 2026. CI1's base-only
// condition missed this pair; neither the author nor the base prefix decides it.
const e3 = { repository: { full_name: "ben2harwood-lgtm/jobguard" }, pull_request: {
  head: { ref: "codex/sandbox/v2-e3", sha: "80d4bd0d7c78a449e6f2a77cb540d8453c3d8df4", repo: { full_name: "ben2harwood-lgtm/jobguard" } },
  base: { ref: "claude/project-thread-8zze8p", sha: "c04969a162b757a496c262fb8569b7bdb01d696a" },
} };

test("scope includes #932's real Codex E3 / Claude D3 pair and excludes main", () => {
  assert.equal(inV2Scope("pull_request", e3), true);
  for (const base of ["v2/main", "codex/sandbox/v2-d1"]) assert.equal(inV2Scope("pull_request", { pull_request: { base: { ref: base }, head: { ref: "claude/example" } } }), true);
  assert.equal(inV2Scope("pull_request", { pull_request: { ...e3.pull_request, base: { ref: "main" } } }), false);
  assert.equal(inV2Scope("pull_request", { pull_request: { base: { ref: "unrelated" }, head: { ref: "claude/unrelated" } } }), false);
  // Same scope as v2-seed after #938: no seed run means no evidence, so no guard run.
  const fork = { ...e3, pull_request: { ...e3.pull_request, head: { ...e3.pull_request.head, repo: { full_name: "contributor/jobguard" } } } };
  assert.equal(inV2Scope("pull_request", fork), false);
  assert.equal(inV2Scope("pull_request", { ...e3, pull_request: { ...e3.pull_request, base: { ref: "release/1" } } }), false);
  assert.equal(inV2Scope("pull_request", { ...e3, pull_request: { ...e3.pull_request, head: { ref: "feature/editor", repo: e3.pull_request.head.repo } } }), false);
  assert.equal(inV2Scope("push", { ref: "refs/heads/v2/main" }), true);
  assert.equal(inV2Scope("push", { ref: "refs/heads/main" }), false);
  assert.throws(() => inV2Scope("pull_request", {}), /Missing PR branch/);
});

function fixtureRun(source, proof = "", event = e3, seeds = [seed]) {
  const directory = mkdtempSync(join(tmpdir(), "v2-ci2-test-"));
  const eventPath = join(directory, "event.json");
  writeFileSync(eventPath, JSON.stringify(event));
  const calls = [];
  const head = e3.pull_request.head.sha, base = e3.pull_request.base.sha;
  const git = args => {
    calls.push(args);
    if (args[0] === "rev-parse") return args.at(-1).startsWith("HEAD") ? head : args.at(-1).replace(/\^\{commit\}$/u, "");
    if (args[0] === "merge-base") return args.includes("--is-ancestor") ? "" : base;
    if (args[0] === "diff") return args.includes("--name-only") ? `${path}\0` : "@@ -0,0 +1,7 @@\n";
    if (args[0] === "ls-tree") return seeds.join("\0") + "\0";
    if (args[0] === "show") return args[1].endsWith(path) ? source : proof;
    throw new Error(`Unexpected git call: ${args}`);
  };
  try { return { result: inspectAuditChain({ env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: eventPath }, git }), calls }; }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test("diff pipeline scans the actual stacked head against its merge-base and reads head seed evidence", () => {
  const { result, calls } = fixtureRun(audited, evidence);
  assert.equal(result.commands[0].missing, false);
  assert.ok(calls.some(args => args[0] === "diff" && args.includes(e3.pull_request.base.sha) && args.includes(e3.pull_request.head.sha)));
  assert.ok(calls.some(args => args[0] === "show" && args[1] === `${e3.pull_request.head.sha}:${seed}`));
  assert.equal(fixtureRun(broken).result.commands[0].missing, true);
});

test("only the seed file actually executed by v2-seed supplies evidence", () => {
  for (const unexecuted of ["tools/v2/other-seed.test.mjs", "tools/v2/nested/seed.integration.test.mjs"]) {
    const { result, calls } = fixtureRun(audited, evidence, e3, [unexecuted]);
    assert.equal(result.commands[0].missing, true);
    assert.ok(!calls.some(args => args[0] === "show" && args[1].endsWith(unexecuted)));
  }
});

test("invalid parse and missing comparison data fail closed", () => {
  assert.throws(() => scanCommands(path, "async function broken( {"), /Cannot parse/);
  assert.throws(() => inspectAuditChain({ env: {}, git: () => "fixture-head" }), /Missing or invalid comparison ref/);
  assert.throws(() => inspectAuditChain({ env: { LANE_BASE_REF: "same" }, git: () => "fixture-head" }), /Self-comparison/);
  assert.throws(() => fixtureRun(broken, "", { pull_request: { ...e3.pull_request, base: { ref: "v2/main" } } }), /Missing CI comparison SHAs/);
});

test("CLI refuses a missing local base instead of reporting success", () => {
  const env = { ...process.env };
  for (const key of ["GITHUB_EVENT_NAME", "GITHUB_ACTIONS", "LANE_BASE_REF", "GITHUB_STEP_SUMMARY"]) delete env[key];
  const result = spawnSync(process.execPath, ["tools/v2/audit-chain-guard.mjs"], { encoding: "utf8", env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing or invalid comparison ref/);
});

test("actual CLI exits 1 for the broken fixture and 0 for evidenced and exempt fixtures", () => {
  const directory = mkdtempSync(join(tmpdir(), "v2-ci2-cli-"));
  // A fake read-only Git transport, not a new repository or a Git mutation.
  const executable = join(directory, "git");
  writeFileSync(executable, `#!${process.execPath}
const {readFileSync} = require('node:fs');
const fixture = JSON.parse(readFileSync(process.env.CI2_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
const head = '${e3.pull_request.head.sha}', base = '${e3.pull_request.base.sha}';
if (args[0] === 'rev-parse') process.stdout.write(args.at(-1).startsWith('HEAD') ? head : base);
else if (args[0] === 'merge-base') process.stdout.write(base);
else if (args[0] === 'diff') process.stdout.write(args.includes('--name-only') ? '${path}\\0' : '@@ -0,0 +1,7 @@\\n');
else if (args[0] === 'ls-tree') process.stdout.write('${seed}\\0');
else if (args[0] === 'show') process.stdout.write(args[1].endsWith('${path}') ? fixture.source : fixture.proof);
else process.exit(2);
`, { mode: 0o700 });
  const fixturePath = join(directory, "fixture.json");
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, LANE_BASE_REF: "fixture-base", CI2_FIXTURE: fixturePath };
  for (const key of ["GITHUB_EVENT_NAME", "GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY"]) delete env[key];
  try {
    for (const [source, proof, status] of [[broken, "", 1], [audited, evidence, 0],
      [broken.replace("  async save", "  // audit-chain: exempt Helper; reviewed owning command appends.\n  async save"), "", 0]]) {
      writeFileSync(fixturePath, JSON.stringify({ source, proof }));
      const result = spawnSync(process.execPath, ["tools/v2/audit-chain-guard.mjs"], { encoding: "utf8", env });
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stdout, status ? /FAIL: undisposed write pointers/ : /Pointers disposed/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("workflow runs the guard and its fixtures in V2 core-checks without changing CI1 or main", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const step = workflow.match(/      - name: List V2 audit-chain review pointers\n([\s\S]*?)(?=      - )/u)?.[1];
  assert.ok(step);
  // The guard only runs where v2-seed runs the named cases (P2b, after #938).
  const condition = step.match(/^        if: (\$\{\{.*\}\})$/mu)?.[1];
  const seedRequired = workflow.match(/^          V2_SEED_REQUIRED: (\$\{\{.*\}\})$/mu)?.[1];
  const seedJob = workflow.match(/^  v2-seed:\n[\s\S]*?^    if: (\$\{\{.*\}\})$/mu)?.[1];
  assert.ok(condition && seedRequired && seedJob);
  assert.equal(condition, seedRequired);
  assert.equal(condition, seedJob);
  assert.match(step, /node --test tools\/v2-audit-chain-guard\.test\.mjs/);
  assert.match(step, /node tools\/v2\/audit-chain-guard\.mjs/);
  assert.doesNotMatch(step, /continue-on-error|pull_request_target/);
});

test("test files are not pointers, and a named helper arrow belongs to its method", () => {
  const helper = `export class R { async save(tx) { const insert = async () => tx.query("INSERT INTO app.v2_x VALUES (1)"); await insert(); } }`;
  assert.deepEqual(scanCommands("packages/db/src/r.ts", helper).map(command => command.id), ["packages/db/src/r.ts#R.save"]);
  const factory = `export const make = () => ({ save: async tx => tx.query("INSERT INTO app.v2_x VALUES (1)") });`;
  assert.deepEqual(scanCommands("packages/db/src/f.ts", factory).map(command => command.id), ["packages/db/src/f.ts#save"]);
  const directory = mkdtempSync(join(tmpdir(), "v2-ci2-test-"));
  try {
    const eventPath = join(directory, "event.json");
    writeFileSync(eventPath, JSON.stringify(e3));
    const shown = [];
    const git = args => {
      if (args[0] === "rev-parse") return args.at(-1).startsWith("HEAD") ? e3.pull_request.head.sha : args.at(-1).replace(/\^\{commit\}$/u, "");
      if (args[0] === "merge-base") return args.includes("--is-ancestor") ? "" : e3.pull_request.base.sha;
      if (args[0] === "diff") return args.includes("--name-only") ? "packages/db/src/x.test.ts\0apps/api/src/y.test.mts\0" : "@@ -0,0 +1,7 @@\n";
      if (args[0] === "ls-tree") return `${seed}\0`;
      if (args[0] === "show") { shown.push(args[1]); return args[1].endsWith(seed) ? "" : `test("x", () => db.query("INSERT INTO app.v2_x VALUES (1)"));`; }
      throw new Error(`Unexpected git call: ${args}`);
    };
    const result = inspectAuditChain({ env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: eventPath }, git });
    assert.deepEqual(result.commands, []);
    assert.ok(!shown.some(item => /\.test\.m?ts$/u.test(item)));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("both branches of conditional SQL are scanned, including the real accounting export routine", () => {
  const ternary = `export class R { async run(tx, a) { const sql = a ? "SELECT app.v2_one($1) r" : ("SELECT * FROM app.v2_two($1)" as string); await tx.query(sql); } }`;
  assert.deepEqual(scanCommands("packages/db/src/r.ts", ternary)[0].targets, ["routine:app.v2_one", "routine:app.v2_two"]);
  const fallback = `export async function run(tx, sql) { await tx.query(sql ?? "INSERT INTO app.v2_x VALUES (1)"); }`;
  assert.deepEqual(scanCommands("packages/db/src/f.ts", fallback)[0].targets, ["table:v2_x"]);
  const real = "packages/db/src/accounting-export-repository.ts";
  const targets = scanCommands(real, readFileSync(new URL(`../${real}`, import.meta.url), "utf8")).flatMap(command => command.targets);
  for (const routine of ["accounting_export", "accounting_export_route", "accounting_export_route_read"]) assert.ok(targets.includes(`routine:app.${routine}`), routine);
});
