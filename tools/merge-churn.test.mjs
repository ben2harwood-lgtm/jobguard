// MERGE-CHURN-1 (founder decision 35): one lane file per piece and merge-time migration numbering.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import * as lint from "./agent-lane-boundary-lint.mjs";
import { planRenumber, renumber } from "./migration-renumber.mjs";

const legacyPath = "config/agent-lane-assignments.json";
const integration = { branches: ["main"], integration: true, allow: ["tools/**", "config/**", "packages/**"] };
const laneFile = (id, lane = {}) => `${JSON.stringify({ version: 2, lanes: { [id]: { branches: [`codex/sandbox/${id}`], allow: [`tools/${id}/**`, `packages/db/migrations/0002_${id}.sql`], ...lane } } }, null, 2)}\n`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "jobguard-merge-churn-")), cwd = join(root, "repo");
  mkdirSync(cwd); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Churn test"); git("config", "user.email", "churn-test@example.invalid");
  git("config", "commit.gpgsign", "false");
  const write = (path, text = "piece\n") => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  const commit = (message = "fixture") => { git("add", "-A"); git("commit", "--allow-empty", "-m", message); return git("rev-parse", "HEAD"); };
  const tryMerge = (ref) => { try { git("merge", "--no-ff", "--no-edit", ref); return true; } catch { git("merge", "--abort"); return false; } };
  // The legacy register in its real shape: one lane per line, so two appended lanes touch neighbouring lines.
  const legacyLines = (lanes) => `{"version":2,"lanes":{\n${Object.entries(lanes).map(([id, lane]) => `${JSON.stringify(id)}:${JSON.stringify(lane)}`).join(",\n")}\n}}\n`;
  const legacy = { "main-integration": integration };
  write(legacyPath, legacyLines(legacy));
  write("packages/db/migrations/0001_base.sql", "SELECT 1;\n");
  write("packages/db/migrate-list.txt", "0001_base.sql\n");
  const base = commit("base");
  const inspect = (env = {}) => lint.inspectLane({ cwd, env });
  const push = (before, after) => {
    const path = join(root, "push.json"); writeFileSync(path, JSON.stringify({ ref: "refs/heads/main", before, after }));
    return inspect({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: path });
  };
  return { root, cwd, git, write, commit, tryMerge, legacyLines, legacy, base, inspect, push };
}

test("MC-1 today's collision: two pieces from one main conflict on the shared lane line and migration list", (t) => {
  const r = repo(t);
  for (const id of ["piece-a", "piece-b"]) {
    r.git("switch", "-c", `codex/sandbox/${id}`, r.base);
    r.write(legacyPath, r.legacyLines({ ...r.legacy, [id]: { branches: [`codex/sandbox/${id}`], allow: [legacyPath] } }));
    r.write("packages/db/migrate-list.txt", `0001_base.sql\n0002_${id}.sql\n`);
    r.write(`packages/db/migrations/0002_${id}.sql`, `-- ${id}\n`);
    r.commit(id);
  }
  r.git("switch", "main");
  assert.equal(r.tryMerge("codex/sandbox/piece-a"), true);
  assert.equal(r.tryMerge("codex/sandbox/piece-b"), false, "the second piece conflicts and needs a catch-up");
});

test("MC-2 after the change: two pieces merge without a conflict; a number clash is renumbered with SQL bytes unchanged", (t) => {
  const r = repo(t);
  const sql = {};
  for (const id of ["piece-a", "piece-b"]) {
    r.git("switch", "-c", `codex/sandbox/${id}`, r.base);
    r.write(`config/lanes/${id}.json`, laneFile(id, { allow: [`tools/${id}/**`, `packages/db/migrations/0002_${id}.sql`, `packages/db/test/${id}.test.ts`] }));
    sql[id] = `-- ${id}\nSELECT '${id}';\n`;
    r.write(`packages/db/migrations/0002_${id}.sql`, sql[id]);
    r.write(`packages/db/test/${id}.test.ts`, `const own = "0002_${id}.sql"; const other = "0002_${id}x";\n`);
    r.write(`tools/${id}/item.mjs`);
    r.commit(id);
    assert.equal(r.inspect().lane, id);
  }
  r.git("switch", "main");
  const before = r.git("rev-parse", "HEAD");
  assert.equal(r.tryMerge("codex/sandbox/piece-a"), true);
  assert.deepEqual(r.push(before, r.git("rev-parse", "HEAD")).lane, "main-integration");
  // The second piece's branch catches up with no conflict; only its number now clashes, and the check says so.
  r.git("switch", "codex/sandbox/piece-b");
  assert.equal(r.tryMerge("main"), true, "catch-up merge has no conflict");
  r.git("update-ref", "refs/remotes/origin/main", "main");
  assert.throws(() => r.inspect(), /Migration order FAILED:\n"packages\/db\/migrations\/0002_piece-b.sql" must be numbered above 0002/u);
  const { plan, rewritten } = renumber({ cwd: r.cwd, base: "main", write: true });
  assert.deepEqual(plan, [{ from: "packages/db/migrations/0002_piece-b.sql", to: "packages/db/migrations/0003_piece-b.sql" }]);
  assert.deepEqual(rewritten.sort(), ["config/lanes/piece-b.json", "packages/db/test/piece-b.test.ts"]);
  r.commit("renumber");
  assert.equal(sha(readFileSync(join(r.cwd, "packages/db/migrations/0003_piece-b.sql"), "utf8")), sha(sql["piece-b"]), "SQL bytes unchanged");
  assert.equal(readFileSync(join(r.cwd, "packages/db/test/piece-b.test.ts"), "utf8"), 'const own = "0003_piece-b.sql"; const other = "0002_piece-bx";\n');
  assert.equal(readFileSync(join(r.cwd, "packages/db/migrations/0002_piece-a.sql"), "utf8"), sql["piece-a"], "merged migration untouched");
  assert.equal(r.inspect().lane, "piece-b");
  r.git("switch", "main"); const mid = r.git("rev-parse", "HEAD");
  assert.equal(r.tryMerge("codex/sandbox/piece-b"), true);
  r.push(mid, r.git("rev-parse", "HEAD"));
  assert.deepEqual(readdirSync(join(r.cwd, "packages/db/migrations")), ["0001_base.sql", "0002_piece-a.sql", "0003_piece-b.sql"]);
  assert.deepEqual(renumber({ cwd: r.cwd, base: "main" }).plan, [], "nothing to renumber on main");
});

test("MC-3 a piece cannot add, edit or remove another lane's file", (t) => {
  const r = repo(t);
  r.git("switch", "-c", "codex/sandbox/piece-b", r.base); r.write("config/lanes/piece-b.json", laneFile("piece-b")); r.commit();
  r.git("switch", "main"); r.tryMerge("codex/sandbox/piece-b"); r.git("update-ref", "refs/remotes/origin/main", "main");
  const start = r.git("rev-parse", "main");
  const attempt = (change) => {
    r.git("switch", "-C", "codex/sandbox/piece-a", start); r.write("config/lanes/piece-a.json", laneFile("piece-a")); change(); r.commit();
    return () => r.inspect();
  };
  assert.throws(attempt(() => r.write("config/lanes/piece-c.json", laneFile("piece-c"))), /Lane piece-a cannot edit:\n"config\/lanes\/piece-c.json"/u);
  assert.throws(attempt(() => r.write("config/lanes/piece-b.json", laneFile("piece-b", { allow: ["packages/**"] }))), /Lane piece-a cannot edit:\n"config\/lanes\/piece-b.json"/u);
  assert.throws(attempt(() => r.git("rm", "-q", "config/lanes/piece-b.json")), /Lane piece-a cannot edit:\n"config\/lanes\/piece-b.json"/u);
  // Its own file is fine, and the coordinator's integration lane may change any lane file.
  assert.equal(attempt(() => {})().lane, "piece-a");
  r.git("switch", "main"); r.write("config/lanes/piece-b.json", laneFile("piece-b", { note: "coordinator repair" }));
  assert.equal(r.push(start, r.commit()).lane, "main-integration");
});

test("MC-4 lane file shape: name equals id, exact branches only, no register grants, no takeover", () => {
  const legacy = { version: 2, lanes: { "main-integration": integration, old: { branches: ["codex/sandbox/old"], branchPrefixes: ["codex/old"], allow: ["tools/old/**"] } } };
  const load = (path, text) => lint.mergeLanePolicy(legacy, [{ path, text }]);
  assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-b")), /lane's id must equal the file name "piece-a"/u);
  assert.throws(() => load("config/lanes/Piece_A.json", laneFile("Piece_A")), /only files named config\/lanes\/<lane-id>.json/u);
  assert.throws(() => load("config/lanes/README.md", "# notes\n"), /only files named/u);
  assert.throws(() => load("config/lanes/sub", undefined), /only files named/u);
  assert.throws(() => load("config/lanes/piece-a.json", "{"), /not valid JSON/u);
  assert.throws(() => load("config/lanes/piece-a.json", JSON.stringify({ version: 2, lanes: { "piece-a": { branches: ["x"], allow: ["a"] } }, defaultLane: "piece-a" })), /with nothing else/u);
  assert.throws(() => load("config/lanes/piece-a.json", JSON.stringify({ version: 2, lanes: { "piece-a": { branches: ["x"], allow: ["a"] }, other: { branches: ["y"], allow: ["a"] } } })), /exactly one lane/u);
  for (const key of ["integration", "branchPrefixes", "coordinator"]) assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-a", { [key]: key === "branchPrefixes" ? ["codex/x"] : true })), /may hold only/u);
  for (const grant of [legacyPath, "config/**", "config/lanes/**", "config/lanes/piece-b.json", "config/lanes"]) assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-a", { allow: ["tools/a/**", grant] })), /cannot grant the lane register/u);
  assert.throws(() => load("config/lanes/old.json", laneFile("old")), /already registered/u);
  assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-a", { branches: ["codex/sandbox/old"] })), /must select only lane "piece-a"/u);
  assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-a", { branches: ["codex/old-thing"] })), /must select only lane "piece-a"/u);
  assert.throws(() => load("config/lanes/piece-a.json", laneFile("piece-a", { branches: [] })), /non-empty list/u);
  // A blanket allow is still refused at selection, exactly as for the legacy register.
  assert.throws(() => lint.selectLane(load("config/lanes/piece-a.json", laneFile("piece-a", { allow: ["**"] })), "codex/sandbox/piece-a"), /blanket/u);
  assert.equal(lint.mergeLanePolicy(legacy, []), legacy, "no lane directory reads exactly the legacy register");
});

test("MC-5 every existing lane is unchanged after the move, and this piece registers the new way", () => {
  const root = new URL("../", import.meta.url).pathname;
  const legacy = JSON.parse(readFileSync(join(root, legacyPath), "utf8"));
  const merged = lint.loadLanePolicy(root);
  for (const [name, lane] of Object.entries(legacy.lanes)) {
    assert.deepEqual(merged.lanes[name], lane);
    for (const branch of [...(lane.branches ?? []), ...(lane.branchPrefixes ?? [])]) assert.equal(lint.selectLane(merged, branch).name, name);
  }
  const files = readdirSync(join(root, "config/lanes")).sort();
  assert.ok(files.includes("merge-churn-1.json"));
  assert.deepEqual(Object.keys(merged.lanes).length, Object.keys(legacy.lanes).length + files.length);
  assert.equal(lint.selectLane(merged, "codex/sandbox/merge-churn-1").name, "merge-churn-1");
});

test("MC-6 migration order: added migrations must sort above the base and never share a number", () => {
  const m = (name) => `packages/db/migrations/${name}.sql`;
  const base = [m("0001_a"), m("0155_b"), "packages/db/MIGRATIONS.md"];
  assert.deepEqual(lint.migrationOrderViolations(base, [m("0156_c"), m("0157_d"), "packages/db/src/x.ts"]), []);
  assert.match(lint.migrationOrderViolations(base, [m("0152_c")])[0], /0152_c.sql" must be numbered above 0155/u);
  assert.match(lint.migrationOrderViolations(base, [m("0155_c")])[0], /must be numbered above 0155/u);
  assert.match(lint.migrationOrderViolations(base, [m("0156_c"), m("0156_d")])[0], /shares number 0156/u);
  assert.deepEqual(planRenumber(base, [m("0156_c")]), []);
  assert.deepEqual(planRenumber(base, [m("0153_c"), m("0160_d")]), [{ from: m("0153_c"), to: m("0156_c") }, { from: m("0160_d"), to: m("0157_d") }]);
});

test("MC-7 a pull request adding a low-numbered migration is refused even when its lane allows the file", (t) => {
  const r = repo(t);
  r.git("switch", "main"); r.write("packages/db/migrations/0005_merged.sql", "SELECT 5;\n"); const main = r.commit();
  r.git("switch", "-c", "codex/sandbox/piece-a", r.base);
  r.write("config/lanes/piece-a.json", laneFile("piece-a", { allow: ["packages/db/migrations/0002_piece-a.sql"] }));
  r.write("packages/db/migrations/0002_piece-a.sql", "SELECT 2;\n"); const head = r.commit();
  const path = join(r.root, "pr.json");
  writeFileSync(path, JSON.stringify({ pull_request: { base: { sha: main }, head: { sha: head, ref: "codex/sandbox/piece-a" } } }));
  assert.throws(() => r.inspect({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path }), /Migration order FAILED/u);
  // Untracked local additions are checked too.
  r.git("switch", "main"); r.git("switch", "-c", "codex/sandbox/piece-c");
  r.write("config/lanes/piece-c.json", laneFile("piece-c", { allow: ["packages/db/migrations/0003_piece-c.sql"] })); r.commit();
  r.git("update-ref", "refs/remotes/origin/main", "main");
  r.write("packages/db/migrations/0003_piece-c.sql", "SELECT 3;\n");
  assert.throws(() => r.inspect(), /0003_piece-c.sql" must be numbered above 0005/u);
});

test("MC-8 train: a piece lane read from its lane file is honoured, and it cannot carry another lane's file", (t) => {
  const r = repo(t);
  const heads = {};
  for (const id of ["piece-a", "piece-b"]) {
    r.git("switch", "-c", `codex/sandbox/${id}`, r.base); r.write(`config/lanes/${id}.json`, laneFile(id));
    if (id === "piece-b") r.write("config/lanes/piece-z.json", laneFile("piece-z"));
    r.write(`tools/${id}/item.mjs`); heads[id] = r.commit(); r.git("update-ref", `refs/remotes/origin/codex/sandbox/${id}`, heads[id]);
  }
  r.git("switch", "-c", "train/2026-10-14-a", r.base);
  r.git("merge", "--no-ff", "--no-edit", heads["piece-a"]);
  const event = () => {
    const path = join(r.root, "train.json");
    writeFileSync(path, JSON.stringify({ pull_request: { draft: true, base: { sha: r.base, ref: "main" }, head: { sha: r.git("rev-parse", "HEAD"), ref: "train/2026-10-14-a" } } }));
    return { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path, GITHUB_HEAD_REF: "train/2026-10-14-a" };
  };
  const result = r.inspect(event());
  assert.deepEqual(result.train.pieces.map((piece) => piece.lane), ["piece-a"]);
  assert.deepEqual(result.files, ["config/lanes/piece-a.json", "tools/piece-a/item.mjs"]);
  r.git("merge", "--no-ff", "--no-edit", heads["piece-b"]);
  assert.throws(() => r.inspect(event()), /piece codex\/sandbox\/piece-b, lane piece-b cannot edit: "config\/lanes\/piece-z.json"/u);
});

function renumberFixture(t, numbers) {
  const r = repo(t);
  r.write("packages/db/migrations/0002_merged.sql", "SELECT 'merged';\n"); r.commit();
  r.git("switch", "-c", "codex/sandbox/repair", r.base);
  const stems = numbers.map((number) => `${String(number).padStart(4, "0")}_fix`);
  for (const stem of stems) {
    r.write(`packages/db/migrations/${stem}.sql`, `SELECT '${stem}';\n`);
    r.write(`packages/db/migration-notes/${stem}.md`, `Note for ${stem}\n`);
  }
  const references = `${stems.join(" ")}\n`;
  r.write("packages/db/migration-index.txt", references);
  r.write("docs/ledger/REPAIR.md", references);
  r.commit();
  assert.equal(r.tryMerge("main"), true);
  return { ...r, stems };
}

for (const numbers of [[2, 3], [2, 3, 4], [1, 5]]) {
  test(`Repair r1 renumbers ${numbers.join(" + ")} with SQL, notes, index and ledger intact`, (t) => {
    const r = renumberFixture(t, numbers);
    const expected = r.stems.map((stem, i) => ({
      from: `packages/db/migrations/${stem}.sql`,
      to: `packages/db/migrations/${String(3 + i).padStart(4, "0")}_fix.sql`,
    }));
    const dryRun = renumber({ cwd: r.cwd, base: "main" });
    assert.deepEqual(dryRun.plan, expected);
    assert.equal(r.git("status", "--porcelain"), "");
    const result = renumber({ cwd: r.cwd, base: "main", write: true });
    assert.deepEqual(result.plan, dryRun.plan);
    for (const [i, { from, to }] of expected.entries()) {
      assert.equal(readFileSync(join(r.cwd, to), "utf8"), `SELECT '${r.stems[i]}';\n`, from);
      assert.equal(readFileSync(join(r.cwd, `packages/db/migration-notes/${String(3 + i).padStart(4, "0")}_fix.md`), "utf8"), `Note for ${String(3 + i).padStart(4, "0")}_fix\n`);
    }
    const references = `${expected.map(({ to }) => to.split("/").at(-1).slice(0, -4)).join(" ")}\n`;
    for (const path of ["packages/db/migration-index.txt", "docs/ledger/REPAIR.md"]) {
      assert.equal(readFileSync(join(r.cwd, path), "utf8"), references);
    }
    assert.deepEqual(readdirSync(join(r.cwd, "packages/db/migrations")).sort(), ["0001_base.sql", "0002_merged.sql", ...expected.map(({ to }) => to.split("/").at(-1))]);
    assert.deepEqual(readdirSync(join(r.cwd, "packages/db/migration-notes")).sort(), expected.map(({ to }) => to.split("/").at(-1).replace(".sql", ".md")));
    assert.equal(r.git("diff", "--name-only"), "", "all final changes are staged");
  });
}

test("Repair r1 already valid numbers leave files and index unchanged", (t) => {
  const r = renumberFixture(t, [3, 4]);
  assert.deepEqual(renumber({ cwd: r.cwd, base: "main" }), { plan: [], rewritten: [], renamed: [] });
  assert.deepEqual(renumber({ cwd: r.cwd, base: "main", write: true }), { plan: [], rewritten: [], renamed: [] });
  assert.equal(r.git("status", "--porcelain", "--untracked-files=all"), "");
});

test("Repair r1 failed writes restore original names without temporary files", async (t) => {
  // Fail after a partial first phase and after a partial second phase, including notes.
  for (const failAt of [2, 6]) {
    await t.test(`rename failure ${failAt}`, (t) => {
      const r = renumberFixture(t, [2, 3]);
      const original = r.git("ls-files", "-z").split("\0").filter(Boolean);
      const bytes = original.map((file) => readFileSync(join(r.cwd, file)));
      const move = fs.renameSync;
      let calls = 0;
      const mock = t.mock.method(fs, "renameSync", (...args) => {
        if (++calls === failAt) throw new Error("injected move failure");
        return move(...args);
      });
      try {
        assert.throws(() => renumber({ cwd: r.cwd, base: "main", write: true }), /injected move failure/u);
      } finally { mock.mock.restore(); }
      assert.ok(calls >= failAt, "failure occurred during a filesystem move");
      assert.equal(r.git("status", "--porcelain", "--untracked-files=all"), "", "no temporary or partial changes remain");
      original.forEach((file, i) => assert.deepEqual(readFileSync(join(r.cwd, file)), bytes[i], file));
      assert.deepEqual(readdirSync(join(r.cwd, "packages/db/migrations")).sort(), ["0001_base.sql", "0002_fix.sql", "0002_merged.sql", "0003_fix.sql"]);
      assert.deepEqual(readdirSync(join(r.cwd, "packages/db/migration-notes")).sort(), ["0002_fix.md", "0003_fix.md"]);
    });
  }
});
