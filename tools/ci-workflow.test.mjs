import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.deepEqual(Object.keys(jobs).sort(), ["checks", "core", "dependency-review", "secrets", "web"]);
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
  for (const command of ["typecheck", "lint", "test"]) assert.ok(jobs.core.includes(`      - run: pnpm ${command}\n`));
  assert.ok(jobs.web.includes("      - run: pnpm build\n"));
  assert.match(jobs.web, /^        run: pnpm test:e2e$/m);
  assert.ok(jobs.web.includes("run: pnpm --filter @jobguard/web exec playwright install --with-deps chromium"));
  for (const name of ["core", "web"]) {
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
  const upload = jobs.web.slice(jobs.web.indexOf("      - name: Upload Playwright failure evidence"));
  assert.ok(jobs.web.indexOf("run: pnpm test:e2e") < jobs.web.indexOf(upload));
  assert.match(upload, /^        if: \$\{\{ failure\(\) \}\}$/m);
  assert.match(upload, /^        uses: actions\/upload-artifact@v4\.6\.2$/m);
  assert.ok(upload.includes("name: playwright-evidence-${{ github.run_attempt }}"));
  for (const path of ["apps/web/playwright-report/", "apps/web/test-results/"]) assert.ok(upload.includes(path));
  assert.match(upload, /^          retention-days: 14$/m);
  assert.match(upload, /^          if-no-files-found: warn$/m);
});

test("the actual aggregate shell fails closed for every dependency result", () => {
  const script = runScript(jobs.checks);
  const success = Object.fromEntries(Object.keys(resultEnv).map((name) => [name, "success"]));
  function execute(env) {
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "-c", script], { env, encoding: "utf8" });
    assert.ifError(result.error);
    return result;
  }
  const passing = execute(success);
  assert.equal(passing.status, 0, passing.stderr);
  for (const job of Object.values(resultEnv)) assert.ok(passing.stdout.includes(`${job}: success`));
  for (const name of Object.keys(resultEnv)) {
    for (const value of ["failure", "cancelled", "skipped", "", "Success", "success "]) {
      const env = { ...success, [name]: value };
      const result = execute(env);
      assert.equal(result.status, 1, `${name}=${JSON.stringify(value)}: ${result.stderr}`);
      for (const [variable, job] of Object.entries(resultEnv)) assert.ok(result.stdout.includes(`${job}: ${env[variable]}`));
    }
    const missing = { ...success };
    delete missing[name];
    assert.equal(execute(missing).status, 1, `${name} absent`);
  }
  assert.equal(execute({}).status, 1, "all results absent");
});
