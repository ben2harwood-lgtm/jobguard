import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as lint from "./agent-lane-boundary-lint.mjs";

const name = "train/2026-10-12-a";
const configPath = "config/agent-lane-assignments.json";
const tool = fileURLToPath(new URL("./agent-lane-boundary-lint.mjs", import.meta.url));
const notice = "This tool verified only that every commit is a clean merge of main or an exact current branch tip that passes its own lane check; it does not verify that any piece is approved (verdicts live off-branch).";
const unknown = (branch) => `Branch ${JSON.stringify(branch)} must match exactly one registered lane; found 0. Register the task before building.`;
const lane = (id) => ({ branches: [`codex/sandbox/piece-${id}`], allow: [`tools/${id}/**`, configPath] });
let seed;
after(() => { if (seed) rmSync(seed.root, { recursive: true, force: true }); });
function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "jobguard-train-")), cwd = join(root, "repo");
  const cached = Object.keys(options).length === 0 ? seed : undefined;
  if (cached) cpSync(cached.cwd, cwd, { recursive: true }); else mkdirSync(cwd);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  if (!cached) {
    git("init", "-b", "main"); git("config", "user.name", "Train test"); git("config", "user.email", "train-test@example.invalid");
    git("config", "commit.gpgsign", "false"); git("config", "merge.gpgsign", "false");
  }
  const write = (path, text = "piece\n") => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  const commit = (path, text) => { if (path) write(path, text); git("add", "-A"); git("commit", "--allow-empty", "-m", "fixture change"); return git("rev-parse", "HEAD"); };
  const integration = { branches: ["main"], integration: true, allow: ["tools/**", configPath] };
  const policy = { version: 2, lanes: options.selfRegister ? { integration } : { "piece-a": lane("a"), integration, "piece-b": lane("b") } };
  const writePolicy = (p) => write(configPath, `${JSON.stringify(p, null, 2)}\n`);
  let base = cached?.base;
  const pieces = cached ? structuredClone(cached.pieces) : [];
  if (!cached) {
    writePolicy(policy); write("README.md", "base\n"); base = commit();
    for (const id of ["a", "b"].slice(0, options.one ? 1 : 2)) {
      const branch = `codex/sandbox/piece-${id}`;
      git("switch", "-c", branch, base);
      if (options.selfRegister) {
        const lanes = id === "a" ? { "piece-a": lane("a"), ...policy.lanes } : { ...policy.lanes, "piece-b": lane("b") };
        writePolicy({ ...policy, lanes });
      }
      options.editPiece?.({ id, write, writePolicy, policy: JSON.parse(readFileSync(join(cwd, configPath), "utf8")) });
      write(`tools/${id}/item.mjs`);
      const head = commit(); git("update-ref", `refs/remotes/origin/${branch}`, head);
      pieces.push({ branch, lane: `piece-${id}`, head });
    }
    git("switch", "-c", name, base);
    const merge = (ref, ...args) => git("merge", "--no-ff", "--no-edit", ...args, ref);
    if (!options.noMerge) for (const piece of pieces) merge(piece.head);
  }
  const merge = (ref, ...args) => git("merge", "--no-ff", "--no-edit", ...args, ref);
  // Copy the default git-built history into independent temp repositories. Every
  // refusal still starts from the same passing two-piece train, without rebuilding
  // its identical history for each case.
  if (!cached && Object.keys(options).length === 0) {
    const seedRoot = mkdtempSync(join(tmpdir(), "jobguard-train-seed-"));
    const seedCwd = join(seedRoot, "repo"); cpSync(cwd, seedCwd, { recursive: true });
    seed = { root: seedRoot, cwd: seedCwd, base, pieces: structuredClone(pieces) };
  }
  const eventPath = join(root, "event.json");
  const payload = () => ({ pull_request: { draft: true, base: { sha: base, ref: "main" }, head: { sha: git("rev-parse", "HEAD"), ref: name } } });
  const eventEnv = (event = payload(), more = {}) => {
    writeFileSync(eventPath, JSON.stringify(event));
    return { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: eventPath, GITHUB_HEAD_REF: event.pull_request?.head?.ref, ...more };
  };
  const inspect = (event = payload(), more = {}, argv = [], config) => lint.inspectLane({ cwd, env: eventEnv(event, more), argv, config });
  const cli = (event = payload()) => execFileSync(process.execPath, [tool], { cwd, encoding: "utf8", env: { ...process.env, ...eventEnv(event) }, stdio: ["pipe", "pipe", "pipe"] });
  const snapshot = () => {
    const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]).sort();
    return { objects: files(join(cwd, ".git/objects")), refs: git("for-each-ref"), status: git("status", "--porcelain") };
  };
  return { root, cwd, git, write, commit, writePolicy, policy, base, pieces, merge, payload, inspect, cli, snapshot };
}
function refused(f, terms, event, more) {
  assert.throws(() => f.inspect(event, more), (error) => {
    assert.ok(error.message.startsWith(`Train branch ${JSON.stringify(name)} refused: `), error.message);
    for (const term of terms) assert.ok(error.message.includes(term), error.message);
    return true;
  });
}

test("TL-P1 two exact registered heads pass in merge order", (t) => {
  const f = fixture(t), result = f.inspect();
  assert.equal(result.lane, null); assert.deepEqual(result.train.pieces, f.pieces);
  assert.deepEqual(result.files, ["tools/a/item.mjs", "tools/b/item.mjs"]);
  assert.deepEqual(result.train.commits, f.git("rev-list", "--first-parent", `${f.base}..HEAD`).split("\n"));
});
test("TL-P2 pieces each register their own separated lane line", (t) => {
  const f = fixture(t, { selfRegister: true });
  assert.deepEqual(f.inspect().train.pieces, f.pieces);
  assert.deepEqual(f.inspect().files, [configPath, "tools/a/item.mjs", "tools/b/item.mjs"]);
});
test("TL-P3 advanced main and GitHub merge checkout exclude main-only paths", (t) => {
  const f = fixture(t); f.git("switch", "main"); const base = f.commit("main-only.txt");
  f.git("switch", name); f.merge(base); const head = f.git("rev-parse", "HEAD");
  f.git("switch", "main"); f.merge(head);
  const event = f.payload(); event.pull_request.base.sha = base; event.pull_request.head.sha = head;
  const result = f.inspect(event); assert.deepEqual(result.train.pieces, f.pieces);
  assert.deepEqual(result.files, ["tools/a/item.mjs", "tools/b/item.mjs"]); assert.equal(result.head, head);
});
test("TL-P4 one registered head passes", (t) => {
  const f = fixture(t, { one: true }); assert.deepEqual(f.inspect().train.pieces, f.pieces);
});
test("TL-P5 pass and refusal preserve objects refs index and worktree", (t) => {
  const f = fixture(t); f.write("untracked.txt"); f.write("tools/a/staged.mjs"); f.git("add", "tools/a/staged.mjs");
  const before = f.snapshot(); f.inspect(); assert.deepEqual(f.snapshot(), before);
  const event = f.payload(); event.pull_request.draft = false; refused(f, ["draft"], event); assert.deepEqual(f.snapshot(), before);
  // Exercise scratch cleanup after merge recomputation, too.
  f.git("commit", "--amend", "--no-edit"); const snapshot = f.snapshot();
  refused(f, [f.git("rev-parse", "HEAD"), "tools/a/staged.mjs"]); assert.deepEqual(f.snapshot(), snapshot);
});
test("TL-P6 train CLI prints approval limit and ordinary CLI does not", (t) => {
  const f = fixture(t); const output = f.cli(); assert.ok(output.includes(notice));
  const result = JSON.parse(output.split("\n")[0].slice("Lane boundary passed: ".length)); assert.deepEqual(result.train.pieces, f.pieces);
  f.git("switch", f.pieces[0].branch); const event = f.payload(); event.pull_request.head.ref = f.pieces[0].branch;
  assert.ok(f.cli(event).startsWith("Lane boundary passed: ")); assert.equal(f.cli(event).includes(notice), false);
});
for (const kind of ["extra inside", "extra outside", "altered", "dropped", "ours"]) test(`TL-R1 ${kind} hand-edited merge is refused`, (t) => {
  const f = fixture(t); f.git("switch", "--detach", "HEAD^");
  const path = kind === "extra inside" ? "tools/a/extra.mjs" : kind === "extra outside" ? "outside.txt" : "tools/b/item.mjs";
  if (kind === "ours") f.merge(f.pieces[1].head, "-s", "ours");
  else {
    f.git("merge", "--no-ff", "--no-commit", f.pieces[1].head);
    if (kind === "dropped") f.git("rm", "-f", path); else f.write(path, "hand edited\n"); f.commit();
  }
  refused(f, [f.git("rev-parse", "HEAD"), path]);
});
for (const kind of ["same file line", "adjacent lane lines"]) test(`TL-R2 ${kind} resolved conflict is refused`, (t) => {
  const f = fixture(t); f.git("switch", "--detach", f.base);
  let a, b;
  if (kind === "same file line") {
    f.write("tools/a/shared.mjs", "base\n"); const base = f.commit();
    f.git("switch", "--detach", base); a = f.commit("tools/a/shared.mjs", "a\n");
    f.git("switch", "--detach", base); b = f.commit("tools/a/shared.mjs", "b\n");
  } else {
    f.write(configPath, '{"version":2,"lanes":{\n"integration":{"branches":["main"],"integration":true,"allow":["tools/**"]}\n}}\n'); const base = f.commit();
    f.write(configPath, '{"version":2,"lanes":{\n"piece-a":{"branches":["codex/sandbox/piece-a"],"allow":["tools/**","config/agent-lane-assignments.json"]},\n"integration":{"branches":["main"],"integration":true,"allow":["tools/**"]}\n}}\n'); a = f.commit();
    f.git("switch", "--detach", base);
    f.write(configPath, '{"version":2,"lanes":{\n"piece-b":{"branches":["codex/sandbox/piece-b"],"allow":["tools/**","config/agent-lane-assignments.json"]},\n"integration":{"branches":["main"],"integration":true,"allow":["tools/**"]}\n}}\n'); b = f.commit();
  }
  f.git("switch", "--detach", f.base); f.merge(a);
  assert.throws(() => f.merge(b));
  f.writePolicy(f.policy); f.write("tools/a/shared.mjs", "resolved\n"); const head = f.commit();
  f.git("update-ref", "refs/remotes/origin/codex/sandbox/piece-a", a);
  f.git("update-ref", "refs/remotes/origin/codex/sandbox/piece-b", b);
  // Permit the shared path in b so its own lane check is not the reason for refusal.
  if (kind === "same file line") {
    f.git("switch", "--detach", b); const p = structuredClone(f.policy); p.lanes['piece-b'].allow.push("tools/a/**"); f.writePolicy(p); b = f.commit();
    f.git("update-ref", "refs/remotes/origin/codex/sandbox/piece-b", b);
    f.git("switch", "--detach", `${head}^`); assert.throws(() => f.merge(b)); f.writePolicy(p); f.write("tools/a/shared.mjs", "resolved\n"); f.commit();
  }
  refused(f, ["plain merge conflicts", "piece leaves the train"]);
});
for (const kind of ["ordinary on top", "empty on top", "between merges", "fast-forward", "merge-style message"]) test(`TL-R3 ${kind} one-parent commit is refused`, (t) => {
  const f = fixture(t); let invalid;
  if (kind === "fast-forward") { f.git("switch", "--detach", f.pieces[0].head); invalid = f.pieces[0].head; }
  else if (kind === "between merges") {
    f.git("switch", "--detach", "HEAD^"); invalid = f.commit("tools/a/ordinary.mjs"); f.merge(f.pieces[1].head);
  } else if (kind === "merge-style message") { f.git("commit", "--allow-empty", "-m", "Merge remote-tracking branch piece-a"); invalid = f.git("rev-parse", "HEAD"); }
  else invalid = f.commit(kind === "ordinary on top" ? "tools/a/ordinary.mjs" : undefined);
  refused(f, [invalid, "1 parent"]);
});
for (const kind of ["three parents", "reversed parents", "zero parents"]) test(`TL-R4 ${kind} merge shape is refused`, (t) => {
  const f = fixture(t), head = f.git("rev-parse", "HEAD"), tree = f.git("rev-parse", "HEAD^{tree}");
  const parents = kind === "three parents" ? ["-p", head, "-p", f.pieces[0].head, "-p", f.pieces[1].head] : kind === "reversed parents" ? ["-p", f.pieces[0].head, "-p", head] : [];
  const invalid = f.git("commit-tree", tree, ...parents, "-m", "fixture merge"); f.git("switch", "--detach", invalid);
  refused(f, kind === "reversed parents" ? [invalid, head, "no branch tip"] : [invalid, `${kind === "three parents" ? 3 : 0} parent`]);
});
test("TL-R5 only the draft boolean true is permitted", (t) => {
  const f = fixture(t);
  for (const draft of [false, undefined, null, "true", 1]) {
    const event = f.payload(); event.pull_request.draft = draft; refused(f, ["draft"], event);
  }
});
test("TL-R5 draft decoys do not replace the event boolean", (t) => {
  const f = fixture(t), event = f.payload(); Object.assign(event.pull_request, { draft: false, labels: [{ name: "draft" }], title: "Draft: fixture", body: "draft true" });
  refused(f, ["draft"], event, { TRAIN_DRAFT: "true", GITHUB_PR_DRAFT: "true" });
});
for (const kind of ["no lane", "local only", "parent of tip", "child of tip", "sibling registration", "integration lane", "other train", "two lanes"]) test(`TL-R6 ${kind} second parent is refused`, (t) => {
  const f = fixture(t, kind === "sibling registration" ? { selfRegister: true, editPiece: ({ id, policy, writePolicy }) => {
    if (id === "a") policy.lanes['piece-b'] = lane("b"); else delete policy.lanes['piece-b']; writePolicy(policy);
  } } : {});
  const p = f.pieces[1]; let term = "no branch tip";
  if (kind === "no lane" || kind === "integration lane" || kind === "other train") {
    f.git("update-ref", "-d", `refs/remotes/origin/${p.branch}`);
    const branch = kind === "no lane" ? "unregistered/piece" : kind === "integration lane" ? "main" : "train/other";
    f.git("update-ref", `refs/remotes/origin/${branch}`, p.head); term = kind === "integration lane" ? "Integration lanes cannot be used" : unknown(branch);
  } else if (kind === "local only") f.git("update-ref", "-d", `refs/remotes/origin/${p.branch}`);
  else if (kind === "parent of tip") {
    f.git("switch", p.branch); const next = f.commit("tools/b/next.mjs"); f.git("update-ref", `refs/remotes/origin/${p.branch}`, next); f.git("switch", name);
  } else if (kind === "child of tip") {
    f.git("switch", p.branch); const child = f.commit("tools/b/child.mjs"); f.git("switch", "--detach", `${name}^`); f.merge(child); p.head = child;
  } else if (kind === "sibling registration") term = unknown(p.branch);
  else {
    f.git("switch", p.branch); const policy = structuredClone(f.policy); policy.lanes.second = { ...lane("b"), branches: ["codex/sandbox/second"] }; f.writePolicy(policy); p.head = f.commit();
    f.git("update-ref", `refs/remotes/origin/${p.branch}`, p.head); f.git("update-ref", "refs/remotes/origin/codex/sandbox/second", p.head);
    f.git("switch", "--detach", `${name}^`); f.merge(p.head); term = "different lanes";
  }
  refused(f, [f.git("rev-parse", "HEAD"), p.head, term]);
});
test("TL-R7 piece must pass its own lane", (t) => {
  const f = fixture(t, { editPiece: ({ id, write }) => { if (id === "b") write("packages/db/protected.txt"); } });
  refused(f, [f.pieces[1].head, f.pieces[1].branch, "piece-b", "packages/db/protected.txt"]);
});
test("TL-R8 only the main base branch is permitted", (t) => {
  const f = fixture(t);
  for (const baseRef of ["codex/sandbox/piece-a", undefined]) {
    const event = f.payload(); event.pull_request.base.ref = baseRef; refused(f, ["base branch", "main"], event);
  }
});
test("TL-R9 only main-side merges are refused", (t) => {
  const f = fixture(t); f.git("switch", "--detach", f.base); const a = f.commit("tools/a/main.mjs");
  f.git("switch", "--detach", f.base); const b = f.commit("tools/b/main.mjs");
  f.git("switch", "main"); f.merge(a); f.merge(b); const base = f.git("rev-parse", "HEAD");
  f.git("switch", "--detach", f.base); f.merge(a, "-m", "main-side train a"); f.merge(b, "-m", "main-side train b");
  const event = f.payload(); event.pull_request.base.sha = base; refused(f, ["at least one registered head"], event);
});
test("TL-R10 shallow repository requires full history", (t) => {
  const f = fixture(t), cwd = join(f.root, "shallow"); f.git("clone", "--depth", "1", "--no-local", "--branch", name, f.cwd, cwd);
  execFileSync("git", ["fetch", "--depth=1", f.cwd, f.pieces[0].head], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const event = f.payload(); event.pull_request.base.sha = f.pieces[0].head;
  const eventPath = join(f.root, "shallow-event.json"); writeFileSync(eventPath, JSON.stringify(event));
  assert.throws(() => lint.inspectLane({ cwd, env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: eventPath } }), /Train branch .*refused: .*full history is required/u);
});
test("TL-U1 second net returns paths outside every piece", () => {
  assert.deepEqual(lint.trainPathViolations(["tools/a/item.mjs", "outside.txt", "tools-neighbour/a.mjs"], [lane("a"), lane("b")]), ["outside.txt", "tools-neighbour/a.mjs"]);
});
const invalidNames = ["train-x", "trains/x", "train/", "train", "Train/x", "train/X", "train/x/y", "train//x", "train/../main", "train/..", "train/.x", "train/x.lock", "train/x_y", "train/x y", "train/x-", "train/-x", "train/x--y", "codex/train/x", "xtrain/x", "refs/heads/train/x", `train/${"x".repeat(59)}`, "train/x\n"];
test("TL-D1 all ordinary names retain their whole messages", (t) => {
  const f = fixture(t);
  for (const branch of invalidNames) {
    const event = f.payload(); event.pull_request.head.ref = branch;
    assert.throws(() => f.inspect(event), { message: unknown(branch) });
  }
});
test("TL-D2 local push overrides and other events retain whole messages", (t) => {
  const f = fixture(t);
  assert.throws(() => lint.inspectLane({ cwd: f.cwd, env: {} }), { message: unknown(name) });
  const event = { ref: `refs/heads/${name}`, before: f.base, after: f.git("rev-parse", "HEAD") };
  assert.throws(() => f.inspect(event, { GITHUB_EVENT_NAME: "push", GITHUB_HEAD_REF: undefined }), { message: unknown(name) });
  assert.throws(() => f.inspect(undefined, { AGENT_LANE: "piece-a" }), { message: unknown(name) });
  assert.throws(() => f.inspect(undefined, {}, ["--lane=piece-a"]), { message: unknown(name) });
  assert.throws(() => f.inspect(undefined, { GITHUB_EVENT_NAME: "pull_request_target" }), { message: "Unsupported CI event pull_request_target; no permissive fallback." });
});
test("TL-D3 registered train name uses ordinary lane with or without draft", (t) => {
  const f = fixture(t), policy = structuredClone(f.policy); policy.lanes.named = { branches: [name], allow: ["tools/**"] };
  for (const draft of [true, false, undefined]) {
    const event = f.payload(); event.pull_request.draft = draft;
    const result = f.inspect(event, {}, [], policy); assert.equal(result.lane, "named"); assert.equal(result.train, undefined);
    policy.lanes.named.allow = ["tools/a/**"];
    assert.throws(() => f.inspect(event, {}, [], policy), { message: 'Lane named cannot edit:\n"tools/b/item.mjs"' }); policy.lanes.named.allow = ["tools/**"];
  }
});
test("TL-D4 selectLane still refuses an unregistered train name", () => {
  assert.throws(() => lint.selectLane({ version: 2, lanes: {} }, name), { message: unknown(name) });
});
// Honest-mistake guard on this piece's own trigger line; no byte pin of the shared workflow.
test("TL-W1 ready_for_review starts the pull request check", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const types = workflow.match(/\n  pull_request:\n    types: \[([^\]]+)\]/u)?.[1].split(",").map((type) => type.trim());
  assert.ok(types?.includes("ready_for_review"));
});

test("TL-D6 malformed non-train-rule policies retain their whole messages", (t) => {
  const f = fixture(t);
  assert.throws(() => f.inspect(undefined, {}, [], { version: 1 }), { message: "Lane policy must be version 2 with no fallback/default lane." });
  assert.throws(() => f.inspect(undefined, {}, [], { version: 2 }), { message: "Cannot convert undefined or null to object" });
});
test("TL-R11 train rule refuses invalid policy versions and fallback policies", (t) => {
  const f = fixture(t);
  for (const policy of [{ version: 1, lanes: {} }, { version: 2, lanes: {}, defaultLane: "piece-a" }]) {
    assert.throws(() => f.inspect(undefined, {}, [], policy), { message: `Train branch ${JSON.stringify(name)} refused: Lane policy must be version 2 with no fallback/default lane.` });
  }
});
