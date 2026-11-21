import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("evidence schedule is offline by default and reserves against a shared cap", t => {
  const root = mkdtempSync(join(tmpdir(), "jobguard-launch-evidence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL("./launch-test/", import.meta.url), join(root, "tools", "launch-test"), { recursive: true });
  execFileSync("git", ["init", "-q", root]);
  const stub = join(root, "fake-provider.mjs");
  writeFileSync(stub, `
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (options.headers.Authorization !== "Bearer fixture-key" || body.max_output_tokens !== 1200 ||
          body.input.includes("expectedAnswer")) throw Error("Unexpected request");
      if (process.env.FIXTURE_UNKNOWN) return new Response("unknown", { status: 502, headers: { "x-request-id": "fixture-unknown" } });
      return new Response(JSON.stringify({ usage: { input_tokens: 100, output_tokens: 100 }, output: [] }),
        { headers: { "x-request-id": "fixture-1" } });
    };
  `);
  const env = { ...process.env };
  delete env.OPENAI_API_KEY_TESTS;
  const invoke = (args, extraEnv = {}) => spawnSync(process.execPath,
    ["--import", stub, join(root, "tools", "launch-test", "evidence.mjs"), ...args],
    { cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8" });
  const jobKey = { OPENAI_API_KEY_TESTS: "fixture-key" };
  const ledgerDir = join(root, ".git", "jobguard-launch-evidence");
  const ledger = () => JSON.parse(readFileSync(join(ledgerDir, "spend.json"), "utf8"));

  const dry = invoke([]);
  assert.equal(dry.status, 0, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.mode, "dry");
  assert.equal(plan.totalRuns, 66);
  assert.equal(plan.capUsd, 1);
  assert.equal(invoke(["--cap=67.01"]).status, 1);
  assert.equal(invoke(["--cap=75.01", "--recheck", "--packet=clear-01"]).status, 1);

  const refused = invoke(["--cap=0.42", "--packet=clear-01"], jobKey);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Spend cap reached/);
  assert.deepEqual(readdirSync(ledgerDir), []);

  const paid = invoke(["--packet=clear-01"], jobKey);
  assert.equal(paid.status, 0, paid.stderr);
  const [first] = ledger().runs;
  assert.equal(first.chargedMicros, 200);
  const record = JSON.parse(readFileSync(join(ledgerDir, first.id + ".json"), "utf8"));
  assert.equal(record.requestId, "fixture-1");
  assert.equal(record.costMicros, 200);
  assert.deepEqual(record.tokens, { input_tokens: 100, output_tokens: 100 });
  assert.deepEqual(JSON.parse(record.rawResponse).usage, record.tokens);

  const unknown = invoke(["--packet=unclear-01"], { ...jobKey, FIXTURE_UNKNOWN: "1" });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Reservation retained/);
  const runs = ledger().runs;
  assert.equal(runs.length, 2);
  assert.equal(runs[1].state, "unknown");
  assert.equal(runs[1].chargedMicros, 420951);
  const failure = JSON.parse(readFileSync(join(ledgerDir, runs[1].id + ".json"), "utf8"));
  assert.equal(failure.rawResponse, "unknown");
  assert.equal(failure.requestId, "fixture-unknown");
  assert.equal(failure.costMicros, null);
  assert.match(invoke(["--cap=0.84", "--packet=clear-02"], jobKey).stderr, /Spend cap reached/);
  assert.equal(ledger().runs.length, 2);
});
