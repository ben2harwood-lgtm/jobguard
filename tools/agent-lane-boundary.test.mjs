import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectLane, matches, selectLane } from "./agent-lane-boundary-lint.mjs";

const policy = {
  version: 2,
  lanes: {
    repair: { branchPrefixes: ["codex/ci-repair"], allow: ["tools/**"] },
    integration: { branches: ["main"], integration: true, allow: ["tools/**", "README.md"] },
  },
};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "jobguard-lanes-")), cwd = join(root, "repo");
  mkdirSync(cwd);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Lane test"); git("config", "user.email", "lane-test@example.invalid");
  const write = (path, text = "changed\n") => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  const commit = (path, text) => { if (path) write(path, text); git("add", "-A"); git("commit", "-m", "fixture change"); return git("rev-parse", "HEAD"); };
  write("README.md", "initial\n"); write("tools/base.txt", "initial\n"); write("packages/db/protected.txt", "initial\n");
  const base = commit(); git("switch", "-c", "codex/ci-repair");
  const inspect = (env = {}, config = policy, argv = []) => inspectLane({ cwd, env, config, argv });
  const event = (name, payload, more = {}, config = policy) => {
    const path = join(root, "event.json"); writeFileSync(path, JSON.stringify(payload));
    return inspect({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: path, ...more }, config);
  };
  const pr = (head, baseSha = base, more = {}) => event("pull_request", { pull_request: { base: { sha: baseSha }, head: { sha: head, ref: "codex/ci-repair" } } }, more);
  return { root, cwd, git, write, commit, base, inspect, event, pr };
}

test("path scopes match exact files and real directory boundaries", () => {
  assert.equal(matches("tools/**", "tools/a/b.mjs"), true);
  assert.equal(matches("tools/**", "tools-neighbour/file.mjs"), false);
  assert.equal(matches("tools/a.mjs", "tools/a.mjs.extra"), false);
});
test("unknown branches, including the unrelated OWN MIND branch, have no default lane", () => {
  for (const branch of ["work", "codex/unregistered", "integration/own-mind-reconciled-2026-08-21"]) assert.throws(() => selectLane(policy, branch), /exactly one registered lane/u);
});
test("explicit lane override cannot widen an assigned branch", () => assert.throws(() => selectLane(policy, "codex/ci-repair", "integration"), /does not match/u));
test("ambiguous branch assignments fail", () => {
  const config = structuredClone(policy); config.lanes.second = config.lanes.repair;
  assert.throws(() => selectLane(config, "codex/ci-repair"), /found 2/u);
});
test("fallback and blanket grants are rejected", () => {
  assert.throws(() => selectLane({ ...policy, defaultLane: "repair" }, "codex/ci-repair"), /no fallback/u);
  const config = structuredClone(policy); config.lanes.repair.allow = ["**"];
  assert.throws(() => selectLane(config, "codex/ci-repair"), /blanket/u);
});
test("a pull request cannot borrow the main integration lane", () => assert.throws(() => selectLane(policy, "main", undefined, "pull_request"), /cannot be used/u));
test("PR payload checks committed changes in an otherwise clean checkout", (t) => {
  const f = fixture(t), head = f.commit("tools/new.mjs");
  assert.deepEqual(f.pr(head).files, ["tools/new.mjs"]);
});
test("PR comparison excludes unrelated changes that advanced the base branch", (t) => {
  const f = fixture(t), head = f.commit("tools/new.mjs");
  f.git("switch", "main"); const advanced = f.commit("packages/db/protected.txt", "other work\n"); f.git("switch", "codex/ci-repair");
  assert.deepEqual(f.pr(head, advanced).files, ["tools/new.mjs"]);
});
test("main push works without github.base_ref and covers the full before/after range", (t) => {
  const f = fixture(t); f.git("switch", "main"); f.commit("tools/first.mjs"); const after = f.commit("tools/second.mjs");
  const result = f.event("push", { ref: "refs/heads/main", before: f.base, after }, { LANE_BASE_REF: "origin/" });
  assert.equal(result.comparison, "two-endpoint"); assert.deepEqual(result.files, ["tools/first.mjs", "tools/second.mjs"]);
});
test("main push does not silently check only the last commit", (t) => {
  const f = fixture(t); f.git("switch", "main"); f.commit("packages/db/forbidden.mjs"); const after = f.commit("tools/last.mjs");
  assert.throws(() => f.event("push", { ref: "refs/heads/main", before: f.base, after }), /cannot edit/u);
});
test("first push checks every tracked path rather than an empty HEAD diff", (t) => {
  const f = fixture(t); f.git("switch", "main");
  assert.throws(() => f.event("push", { ref: "refs/heads/main", before: "0".repeat(40), after: f.base }), /protected.txt/u);
  const config = structuredClone(policy); config.lanes.integration.allow.push("packages/db/protected.txt");
  const result = f.event("push", { ref: "refs/heads/main", before: "0".repeat(40), after: f.base }, {}, config);
  assert.equal(result.comparison, "initial-tree"); assert.equal(result.files.length, 3);
});
test("missing, malformed and unavailable PR refs fail closed", (t) => {
  const f = fixture(t), head = f.commit("tools/new.mjs");
  for (const base of [undefined, "origin/", "f".repeat(40)]) assert.throws(() => f.event("pull_request", { pull_request: { base: { sha: base }, head: { sha: head, ref: "codex/ci-repair" } } }), /SHA|unavailable/u);
});
test("self-comparison cannot produce a green empty check", (t) => {
  const f = fixture(t), head = f.commit("tools/new.mjs"); assert.throws(() => f.pr(head, head), /self-comparison/u);
});
test("wrong checked-out push commit fails", (t) => {
  const f = fixture(t); f.commit("tools/new.mjs");
  assert.throws(() => f.event("push", { ref: "refs/heads/main", before: f.base, after: f.base }), /not the pushed/u);
});
test("unknown events and missing CI context do not fall back to local checks", (t) => {
  const f = fixture(t);
  assert.throws(() => f.inspect({ GITHUB_ACTIONS: "true" }), /GITHUB_EVENT_NAME/u);
  assert.throws(() => f.inspect({ GITHUB_EVENT_NAME: "push" }), /payload is required/u);
  assert.throws(() => f.event("schedule", {}), /Unsupported CI event/u);
});
test("local runs inspect committed changes even with a clean worktree", (t) => {
  const f = fixture(t); f.commit("tools/new.mjs"); assert.deepEqual(f.inspect().files, ["tools/new.mjs"]);
});
test("local runs include untracked forbidden files", (t) => {
  const f = fixture(t); f.commit("tools/new.mjs"); f.write("packages/db/untracked.txt"); assert.throws(() => f.inspect(), /cannot edit/u);
});
test("local runs inspect the index even when the worktree undoes a staged edit", (t) => {
  const f = fixture(t); f.commit("tools/new.mjs"); f.write("packages/db/protected.txt", "staged\n"); f.git("add", "packages/db/protected.txt"); f.write("packages/db/protected.txt", "initial\n");
  assert.throws(() => f.inspect(), /protected.txt/u);
});
test("renaming a protected file into an allowed directory still checks its old path", (t) => {
  const f = fixture(t); f.git("mv", "packages/db/protected.txt", "tools/moved.txt"); const head = f.commit(); assert.throws(() => f.pr(head), /protected.txt/u);
});
test("deleted forbidden files and newline-containing names cannot evade the guard", (t) => {
  const f = fixture(t); f.git("rm", "packages/db/protected.txt"); f.write("packages/db/bad\nname.txt"); const head = f.commit(); assert.throws(() => f.pr(head), /cannot edit/u);
});
test("invalid explicit local base is not replaced by an empty status check", (t) => {
  const f = fixture(t); f.commit("tools/new.mjs"); assert.throws(() => f.inspect({ LANE_BASE_REF: "origin/" }), /Invalid comparison ref/u);
});
test("conflicting branch and lane assertions fail", (t) => {
  const f = fixture(t), head = f.commit("tools/new.mjs");
  assert.throws(() => f.pr(head, f.base, { GITHUB_HEAD_REF: "codex/something-else" }), /disagrees/u);
  assert.throws(() => f.inspect({ AGENT_LANE: "integration" }, policy, ["--lane=repair"]), /Conflicting/u);
});

test("repository policy maps each declared branch to one scope and registers the observed Codex names", async () => {
  const { readFileSync } = await import("node:fs");
  const actual = JSON.parse(readFileSync(new URL("../config/agent-lane-assignments.json", import.meta.url), "utf8"));
  for (const [name, lane] of Object.entries(actual.lanes)) {
    for (const branch of [...(lane.branches ?? []), ...(lane.branchPrefixes ?? [])]) assert.equal(selectLane(actual, branch).name, name);
  }
  assert.equal(selectLane(actual, "codex/implement-m0-9-transactional-outbox-and-worker-isolation").name, "m0-9");
  assert.equal(selectLane(actual, "codex/implement-mobile-first-shell-and-jobs-list").name, "m1-1");
  assert.ok(actual.lanes['m0-3'].allow.includes("packages/core/src/money.ts"));
  assert.equal(selectLane(actual, "work").name, "demo-neon-bootstrap-fix");
  assert.ok(actual.lanes['ci-repair'].allow.filter((path) => path.startsWith("apps/") || path.startsWith("packages/")).every((path) => path.endsWith("/package.json") || ["apps/web/playwright.config.ts", "apps/web/tsconfig.json"].includes(path)));
});
