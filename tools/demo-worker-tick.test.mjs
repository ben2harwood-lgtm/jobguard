import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/demo-worker-tick.yml", import.meta.url), "utf8");
const script = (() => {
  const match = workflow.match(/^        run: \|\n((?:^          .*\n)+)/m);
  assert.ok(match, "expected the literal tick script");
  return match[1].replace(/^          /gm, "");
})();
const url = (login) => `postgresql://${login}@db.invalid/jobguard_synthetic_demo?sslmode=require`;
const good = {
  JOBGUARD_ENV: "synthetic_demo", TICK_SECONDS: "1",
  GRAPHILE_DATABASE_URL: url("queue"), WORKER_DATABASE_URL: url("actions"),
  RUNTIME_DATABASE_URL: url("runtime"), SHADOW_DATABASE_URL: url("shadow"),
};

// Runs the workflow's own script in a scratch apps/api with a stub worker in place of tsx.
function tick(env, stub = "hang") {
  const dir = mkdtempSync(join(tmpdir(), "demo-worker-tick-"));
  try {
    mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
    const worker = join(dir, "node_modules/.bin/tsx");
    writeFileSync(worker, `#!/usr/bin/env bash
printf '%s\\n' "$*" > started
printf '%s\\n' "\${JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY:-}" > practice
${stub === "hang" ? "trap 'echo stopped > stopped; exit 0' TERM\nwhile true; do sleep 0.1; done" : "exit 3"}
`);
    chmodSync(worker, 0o755);
    const started = Date.now();
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
      { cwd: dir, env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 20_000 });
    assert.ifError(result.error);
    const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8").trim() : null);
    return { ...result, elapsed: Date.now() - started, started: read("started"), stopped: read("stopped"), practice: read("practice") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("merging runs nothing: the only job is gated on the repository opt-in variable", () => {
  assert.deepEqual(workflow.slice(workflow.indexOf("\njobs:\n")).match(/^  [\w-]+:$/gm), ["  tick:"]);
  assert.match(workflow, /^    if: \$\{\{ vars\.JOBGUARD_CRON_ENABLED == 'true' \}\}$/m);
  assert.match(workflow, /^  schedule:\n    - cron: "\*\/10 \* \* \* \*"\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(workflow, /pull_request|push:/);
  assert.match(workflow, /^permissions:\n  contents: read\n(?!  )/m);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /^    timeout-minutes: 15$/m);
});

test("the worker gets only its four least-privilege logins, never the migration credential", () => {
  assert.doesNotMatch(workflow, /^\s*MIGRATION_DATABASE_URL:|secrets\.(?:MIGRATION_|DATABASE_URL\b)/m);
  const secrets = [...workflow.matchAll(/\$\{\{ secrets\.(\w+) \}\}/g)].map(([, name]) => name).sort();
  assert.deepEqual(secrets, ["DEMO_GRAPHILE_DATABASE_URL", "DEMO_RUNTIME_DATABASE_URL", "DEMO_SHADOW_DATABASE_URL", "DEMO_WORKER_DATABASE_URL"]);
  assert.match(workflow, /^          JOBGUARD_ENV: synthetic_demo$/m);
  assert.match(workflow, /^          TICK_SECONDS: "240"$/m);
});

test("the cap is honoured: the worker is stopped by SIGTERM and the tick succeeds", () => {
  const result = tick(good);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.started, "src/worker.ts");
  assert.equal(result.practice, "1");
  assert.equal(result.stopped, "stopped");
  assert.ok(result.elapsed >= 900 && result.elapsed < 10_000, `elapsed ${result.elapsed}ms`);
  assert.match(result.stdout, /Worker stopped at the 1s cap\./);
});

test("a worker that fails before the cap fails the tick", () => {
  const result = tick(good, "fail");
  assert.equal(result.status, 1);
  assert.equal(result.started, "src/worker.ts");
  assert.match(result.stderr, /exit 3/);
});

test("refuses before starting the worker outside the fictional demo", () => {
  for (const [label, env] of [
    ["pilot env", { ...good, JOBGUARD_ENV: "pilot_no_charge" }],
    ["production env", { ...good, JOBGUARD_ENV: "production" }],
    ["missing env", { ...good, JOBGUARD_ENV: "" }],
    ["migration credential", { ...good, MIGRATION_DATABASE_URL: url("admin") }],
    ["missing secret", { ...good, SHADOW_DATABASE_URL: "" }],
    ["other database", { ...good, RUNTIME_DATABASE_URL: "postgresql://runtime@db.invalid/jobguard" }],
    ["database suffix", { ...good, GRAPHILE_DATABASE_URL: "postgresql://queue@db.invalid/jobguard_synthetic_demo_live" }],
    ["unsafe query", { ...good, WORKER_DATABASE_URL: "postgresql://actions@db.invalid/jobguard_synthetic_demo?sslmode=disable" }],
    ["zero cap", { ...good, TICK_SECONDS: "0" }],
    ["long cap", { ...good, TICK_SECONDS: "481" }],
    ["non-numeric cap", { ...good, TICK_SECONDS: "60s" }],
  ]) {
    const result = tick(env);
    assert.equal(result.status, 1, `${label}: ${result.stdout}`);
    assert.match(result.stderr, /^Refused: /m, label);
    assert.equal(result.started, null, `${label} must not start the worker`);
  }
});
