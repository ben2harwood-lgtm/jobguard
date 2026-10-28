import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
// Only the workflow's two-space job blocks and eight-space run blocks are needed.
// Fail on a changed layout rather than silently treating an absent block as valid.
const jobs = Object.fromEntries([...workflow.slice(workflow.indexOf("\njobs:\n") + 7).matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/gm)]
  .map(([, name, body]) => [name, body]));
const resultEnv = { CORE: "core", WEB: "web", SECRETS: "secrets", DEPENDENCY_REVIEW: "dependency-review" };
function runScript(block) {
  const match = block.match(/^        run: \|\n((?:^          .*\n)+)/m);
  assert.ok(match, "expected a literal run script");
  return match[1].replace(/^          /gm, "");
}

test("CI has concurrent core/web jobs behind an always-running checks gate", () => {
  assert.deepEqual(Object.keys(jobs).sort(), ["checks", "core", "core-checks", "core-db", "dependency-review", "secrets", "web", "web-shards"]);
  const needs = jobs.checks.match(/^    needs: \[([^\]]+)\]$/m)?.[1].split(",").map((name) => name.trim());
  assert.deepEqual(needs?.sort(), ["core", "dependency-review", "secrets", "web"]);
  assert.match(jobs.checks, /^    if: \$\{\{ always\(\) \}\}$/m);
  assert.match(jobs.checks, /^    timeout-minutes: 5$/m);
  assert.equal((jobs.checks.match(/^      - /gm) ?? []).length, 1);
  assert.doesNotMatch(jobs.checks, /checkout|\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /continue-on-error/);
  for (const [envName, job] of Object.entries(resultEnv)) {
    assert.ok(jobs.checks.includes(`${envName}: \${{ needs.${job}.result }}`));
    assert.ok(runScript(jobs.checks).includes(`"\${${envName}:-}" != "success"`));
  }
  assert.match(runScript(jobs.checks), /exit 1/);
});

test("core and web retain their commands, setup pins and candidate SHA guards", () => {
  for (const command of ["typecheck", "lint"]) assert.ok(jobs["core-checks"].includes(`      - run: pnpm ${command}\n`));
  assert.ok(jobs["web-shards"].includes("      - run: pnpm build\n"));
  assert.match(jobs["web-shards"], /^        run: pnpm test:e2e --shard=\$\{\{ matrix.shard \}\}\/4$/m);
  assert.ok(jobs["web-shards"].includes("run: pnpm --filter @jobguard/web exec playwright install --with-deps chromium"));
  for (const name of ["core-checks", "core-db", "web-shards"]) {
    const body = jobs[name];
    assert.match(body, /^    runs-on: ubuntu-latest$/m);
    assert.match(body, /^    timeout-minutes: 90$/m);
    assert.doesNotMatch(body, /^    needs:/m);
    assert.ok(body.includes("actions/checkout@v4.2.2\n        with: { fetch-depth: 0, persist-credentials: false }\n      - name: Verify the candidate SHA\n"));
    assert.ok(body.includes("EXPECTED_SHA: ${{ github.sha }}"));
    const script = runScript(body);
    assert.ok(script.includes("actual_sha=$(git rev-parse HEAD)"));
    assert.ok(script.includes('test "$actual_sha" = "$EXPECTED_SHA"'));
    assert.match(script, /printf .*"\$actual_sha"/);
    assert.doesNotMatch(script, /\$\{\{/);
    assert.ok(body.includes("pnpm/action-setup@v4.1.0\n        with: { version: 10.28.1, run_install: false }"));
    assert.ok(body.includes("actions/setup-node@v4.0.3\n        with: { node-version: 24.15.0, cache: pnpm }"));
    assert.ok(body.includes("run: pnpm install --frozen-lockfile\n"));
  }
});

test("web retains Playwright failure evidence with a pinned upload action", () => {
  const upload = jobs["web-shards"].slice(jobs["web-shards"].indexOf("      - name: Upload Playwright failure evidence"));
  assert.ok(jobs["web-shards"].indexOf("run: pnpm test:e2e") < jobs["web-shards"].indexOf(upload));
  assert.match(upload, /^        if: \$\{\{ failure\(\) \}\}$/m);
  assert.match(upload, /^        uses: actions\/upload-artifact@v4\.6\.2$/m);
  assert.ok(upload.includes("name: playwright-evidence-${{ matrix.shard }}-${{ github.run_attempt }}"));
  for (const path of ["apps/web/playwright-report/", "apps/web/test-results/"]) assert.ok(upload.includes(path));
  assert.match(upload, /^          retention-days: 14$/m);
  assert.match(upload, /^          if-no-files-found: warn$/m);
});

for (const [gate, dependencies] of Object.entries({
  checks: resultEnv,
  core: { CORE_CHECKS: "core-checks", CORE_DB: "core-db" },
  web: { WEB_SHARDS: "web-shards" },
})) test(`the actual ${gate} aggregate shell fails closed for every dependency result`, () => {
  const body = jobs[gate];
  assert.match(body, new RegExp(`^    timeout-minutes: ${gate === "checks" ? 5 : 90}$`, "m"));
  assert.match(body, /^    if: \$\{\{ always\(\) \}\}$/m);
  const needs = body.match(/^    needs: \[([^\]]+)\]$/m)?.[1].split(",").map((name) => name.trim());
  assert.deepEqual(needs?.sort(), Object.values(dependencies).sort());
  for (const [envName, job] of Object.entries(dependencies)) {
    assert.ok(body.includes(`${envName}: \${{ needs.${job}.result }}`));
  }
  const script = runScript(body);
  const success = Object.fromEntries(Object.keys(dependencies).map((name) => [name, "success"]));
  function execute(env) {
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "-c", script], { env, encoding: "utf8" });
    assert.ifError(result.error);
    return result;
  }
  const passing = execute(success);
  assert.equal(passing.status, 0, passing.stderr);
  for (const job of Object.values(dependencies)) assert.ok(passing.stdout.includes(`${job}: success`));
  for (const name of Object.keys(dependencies)) {
    for (const value of ["failure", "cancelled", "skipped", "", "Success", "success "]) {
      const env = { ...success, [name]: value };
      const result = execute(env);
      assert.equal(result.status, 1, `${name}=${JSON.stringify(value)}: ${result.stderr}`);
      for (const [variable, job] of Object.entries(dependencies)) assert.ok(result.stdout.includes(`${job}: ${env[variable]}`));
    }
    const missing = { ...success };
    delete missing[name];
    assert.equal(execute(missing).status, 1, `${name} absent`);
  }
  assert.equal(execute({}).status, 1, "all results absent");
});

test("only superseded PR runs cancel; main never cancels in progress", () => {
  assert.ok(workflow.includes("group: ci-${{ github.workflow }}-${{ github.ref }}"));
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' && github.ref != 'refs/heads/main' }}"));
});

test("DB and browser matrices cover all four shards without fail-fast or test selection", () => {
  for (const name of ["core-db", "web-shards"]) {
    assert.match(jobs[name], /^      fail-fast: false$/m);
    assert.match(jobs[name], /^        shard: \[1, 2, 3, 4\]$/m);
    assert.ok(jobs[name].includes("--shard=${{ matrix.shard }}/4"));
  }
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  assert.equal(root.scripts.test, "node --test tools/*.test.mjs && turbo run test");
  assert.ok(jobs["core-checks"].includes("run: node --test tools/*.test.mjs\n"));
  assert.ok(jobs["core-checks"].includes("run: pnpm exec turbo run test --filter='!@jobguard/db'\n"));
  assert.ok(jobs["core-db"].includes("run: pnpm exec turbo run build --filter=@jobguard/api...\n"));
  assert.ok(jobs["core-db"].includes("run: pnpm --filter @jobguard/db test --shard=${{ matrix.shard }}/4\n"));
  const db = JSON.parse(readFileSync(new URL("../packages/db/package.json", import.meta.url)));
  assert.equal(db.scripts.test, "vitest run --passWithNoTests --maxWorkers=1");
  const playwright = readFileSync(new URL("../apps/web/playwright.config.ts", import.meta.url), "utf8");
  assert.match(playwright, /retries: 0/);
  assert.match(playwright, /workers: 1/);
  for (const project of ["mobile-360", "desktop"]) assert.ok(playwright.includes(`name: "${project}"`));
});


test("each DB and browser shard builds its workspace prerequisites before testing", () => {
  const commands = {
    "core-db": ["pnpm exec turbo run build --filter=@jobguard/api...", "pnpm --filter @jobguard/db test --shard=${{ matrix.shard }}/4"],
    "web-shards": ["pnpm build", "pnpm test:e2e --shard=${{ matrix.shard }}/4"],
  };
  for (const [job, [build, runTests]] of Object.entries(commands)) {
    const steps = jobs[job].split(/^      - /m).slice(1);
    const installIndex = steps.findIndex((step) => step.startsWith("run: pnpm install --frozen-lockfile\n"));
    const buildIndex = steps.findIndex((step) => step.startsWith(`run: ${build}\n`));
    const testIndex = steps.findIndex((step) => step.includes(`run: ${runTests}\n`));
    assert.ok(installIndex >= 0 && buildIndex > installIndex && testIndex > buildIndex, `${job}: install, build, then test`);
    assert.doesNotMatch(steps[buildIndex], /if:|continue-on-error/);
  }

  // Compare actual Turbo graphs so a narrowed shard build cannot silently drop
  // any prerequisite that the original unpartitioned root test command built.
  function plan(args) {
    const result = spawnSync(fileURLToPath(new URL("../node_modules/.bin/turbo", import.meta.url)), ["run", ...args, "--dry=json"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).tasks.filter((task) => task.task === "build")
      .map(({ taskId, command, dependencies }) => ({ taskId, command, dependencies: [...dependencies].sort() }))
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
  }
  const original = plan(["test"]);
  assert.ok(original.some((task) => task.taskId === "@jobguard/api#build"));
  assert.ok(original.some((task) => task.taskId === "@jobguard/ai#build"));
  assert.deepEqual(plan(["build", "--filter=@jobguard/api..."]), original);
  const browser = plan(["build"]);
  assert.deepEqual(browser.filter((task) => task.taskId !== "@jobguard/web#build"), original);
  assert.ok(browser.some((task) => task.taskId === "@jobguard/web#build"));
});
