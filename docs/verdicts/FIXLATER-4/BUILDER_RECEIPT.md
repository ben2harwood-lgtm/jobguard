# FIXLATER-4 builder receipt

Base and current HEAD: `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6` (`origin/main`); branch `codex/sandbox/fixlater-4`. Working-tree changes only; dispatcher commits. Issued 12 October 2026; F1 retained, RED lane (fresh Opus + Sol), one pass. Builder implementation is complete; runtime acceptance is pending the Mac helper and independent checks.

Scope: one lane entry, five database test files, this receipt. No product code, migration, dependency, UI, contract or standing-file fingerprint test changed. Tenant isolation, audit integrity and retry diagnostics are affected test guarantees; their production behavior is unchanged. No operational alert, data migration or backwards-compatibility change. All data is synthetic.

## F1 — DONE (implementation; PostgreSQL proof NOT RUN)

`audit-export.integration.test.ts`: add the shared helper import and replace the blind expression with `await freePort(58300, 300)`. Test names are listed in the NOT RUN inventory below; all eleven expanded tests need the Mac run. The security catalogue, directory creation, expectations and existing `120000` hook budget are unchanged.

Command: `git diff origin/main --numstat -- packages/db/test/audit-export.integration.test.ts`; exit 0:

```text
2	2	packages/db/test/audit-export.integration.test.ts
```
Command: `git diff origin/main -U0 -- packages/db/test/audit-export.integration.test.ts`; exit 0; the four changed lines:

```diff
-import { closeTestPools } from "./pool-test-utils.js";
+import { closeTestPools, freePort } from "./pool-test-utils.js";
-  dir = await mkdtemp(join(tmpdir(), "jg-audit-export-")); const port = 58300 + Math.floor(Math.random() * 300);
+  dir = await mkdtemp(join(tmpdir(), "jg-audit-export-")); const port = await freePort(58300, 300);
```

## F2 — DONE (implementation; PostgreSQL proof NOT RUN)

`demo-bootstrap.integration.test.ts`: add the helper import, defer port/address initialization to the existing async hook, and build both addresses from URL parts. The first describe, original login phrase declaration (old line 50), both `60_000` budgets and everything from cluster construction onward are byte-identical. All four tests remain NOT RUN, including the SQL trace test, under the issued no-test-run instruction.

Before (base lines 47–58; sensitive lines described, never quoted):

```text
47: describe("synthetic Vercel/Neon bootstrap", () => {
48:   let postgres: EmbeddedPostgres; let directory: string; let admin: Pool; let runtime: Pool;
49:   const port = 57800 + Math.floor(Math.random() * 100);
50: [unchanged login phrase declaration; not quoted]
51: [written-out database address; removed]
52: [written-out database address; removed]
53:   beforeAll(async () => {
54:     directory = await mkdtemp(join(tmpdir(), "jobguard-bootstrap-"));
55:     postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
56:     await postgres.initialise(); await postgres.start();
57:     const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
58:     await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
```

After (same original block through cluster construction and start-up):

```text
47: describe("synthetic Vercel/Neon bootstrap", () => {
48:   let postgres: EmbeddedPostgres; let directory: string; let admin: Pool; let runtime: Pool;
49:   let port: number; let ownerUrl: string; let runtimeUrl: string;
50: [unchanged login phrase declaration; not quoted]
51:   // Build both addresses from parts in set-up, once the port is known.
52:   const address = (user: string, phrase: string) => {
53:     const url = new URL(`postgresql://127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`);
54:     url.username = user; url.password = phrase; return url.href;
55:   };
56:   beforeAll(async () => {
57:     directory = await mkdtemp(join(tmpdir(), "jobguard-bootstrap-"));
58:     port = await freePort(60200, 100);
59:     ownerUrl = address("neondb_owner", password);
60:     runtimeUrl = address("jobguard_runtime", ["runtime", "synthetic", "only"].join("-"));
61:     postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
62:     await postgres.initialise(); await postgres.start();
63:     const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
64:     await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
```

Pre-edit range command (exit 0), run before any test edit:

```sh
grep -rn -o -E 'freePort\([^)]*\)|createWatchdogHarness\([^)]*\)|[0-9]+ *\+ *Math\.floor\(Math\.random\(\) *\* *[0-9]+\)' packages/db/test
```
Output:

```text
packages/db/test/shadow-persistence.integration.test.ts:27:59000+Math.floor(Math.random()*500)
packages/db/test/shared-money-origin.integration.test.ts:35:freePort(59600,100)
packages/db/test/evidence-pack-upgrade.integration.test.ts:38:freePort(60600, 200)
packages/db/test/materials.integration.test.ts:5:freePort(59900,50)
packages/db/test/audit.integration.test.ts:41:freePort(56000, 500)
packages/db/test/evidence.integration.test.ts:31:freePort(56500,300)
packages/db/test/recovery-message-upgrade.integration.test.ts:31:freePort(61200, 200)
packages/db/test/enterprise-identity.integration.test.ts:28:freePort(59000, 500)
packages/db/test/command-replay-contract.integration.test.ts:10:createWatchdogHarness("replay-contract", 61000)
packages/db/test/contractor.integration.test.ts:15:freePort(58000,500)
packages/db/test/activation.integration.test.ts:4:freePort(57000,200)
packages/db/test/work-order-concurrency.integration.test.ts:25:freePort(59800, 300)
packages/db/test/readiness.integration.test.ts:3:freePort(59500,100)
packages/db/test/job-scheduling.integration.test.ts:53:freePort(59500, 300)
packages/db/test/UIWIRE-10.integration.test.ts:4:freePort(57900,100)
packages/db/test/proof-application-records.integration.test.ts:10:createWatchdogHarness("proof-records", 62500)
packages/db/test/UIWIRE-11.integration.test.ts:4:freePort(58000,100)
packages/db/test/sor-pricing.integration.test.ts:34:freePort(59200, 300)
packages/db/test/small-builder-origin.integration.test.ts:27:59000+Math.floor(Math.random()*500)
packages/db/test/inbox-relevance.integration.test.ts:3:freePort(59600,100)
packages/db/test/UIWIRE-12.integration.test.ts:36:freePort(59000,400)
packages/db/test/extra-fixtures.ts:15:freePort(58800, 400)
packages/db/test/job-activation-terms.integration.test.ts:17:freePort(57200,200)
packages/db/test/review.integration.test.ts:21:freePort(56500,300)
packages/db/test/ledger.integration.test.ts:6:freePort(56500,300)
packages/db/test/final-account.integration.test.ts:4:freePort(57800,100)
packages/db/test/watchdog-lock-order.integration.test.ts:19:createWatchdogHarness("lock-order", 61500)
packages/db/test/watchdog-command-harness.ts:21:createWatchdogHarness(label: string, portBase: number)
packages/db/test/watchdog-command-harness.ts:191:freePort(portBase, 400)
packages/db/test/recovery-messages.integration.test.ts:142:freePort(60900, 200)
packages/db/test/practice-session.integration.test.ts:18:freePort(57000,500)
packages/db/test/outbox.integration.test.ts:38:freePort(57500, 400)
packages/db/test/commands.integration.test.ts:17:freePort(57000,500)
packages/db/test/supplier-matching.integration.test.ts:5:freePort(60000,40)
packages/db/test/sandbox.integration.test.ts:3:freePort(57500,100)
packages/db/test/proof-replay.integration.test.ts:8:createWatchdogHarness("proof-replay", 62000)
packages/db/test/evidence-pack-sources.integration.test.ts:18:freePort(58750, 100)
packages/db/test/recovery-eligibility-v3.integration.test.ts:22:freePort(60500,150)
packages/db/test/supplier-documents.integration.test.ts:5:freePort(59950,40)
packages/db/test/job-import.integration.test.ts:15:freePort(57200,200)
packages/db/test/commercial-integrity.integration.test.ts:16:freePort(58100,100)
packages/db/test/shadow-catalog.integration.test.ts:20:59000+Math.floor(Math.random()*500)
packages/db/test/fingerprinted-row-shape.integration.test.ts:77:freePort(61700, 200)
packages/db/test/recovery-cases.workbench.integration.test.ts:5:freePort(60000,200)
packages/db/test/recovery-follow-up-upgrade.integration.test.ts:118:freePort(61400, 200)
packages/db/test/watchdog-migration-owner.integration.test.ts:55:freePort(60500, 400)
packages/db/test/tenancy.integration.test.ts:30:freePort(55432, 500)
packages/db/test/job.integration.test.ts:4:freePort(56000,500)
packages/db/test/practice-finding-scope.integration.test.ts:18:freePort(59300,200)
packages/db/test/practice-feed.integration.test.ts:80:freePort(60300, 200)
packages/db/test/watchdog-legacy-identities.integration.test.ts:12:createWatchdogHarness("legacy-ids", 63000)
packages/db/test/watchdog.integration.test.ts:35:freePort(60400, 100)
packages/db/test/recovery-follow-up.integration.test.ts:152:freePort(62100, 300)
packages/db/test/work-order-import.integration.test.ts:36:freePort(58800, 400)
packages/db/test/demo-bootstrap.integration.test.ts:49:57800 + Math.floor(Math.random() * 100)
packages/db/test/capture.integration.test.ts:5:freePort(56000,500)
packages/db/test/recovery.integration.test.ts:16:freePort(57600,100)
packages/db/test/practice-scope.integration.test.ts:22:freePort(59000,300)
packages/db/test/workspace-read.integration.test.ts:22:freePort(59800, 100)
packages/db/test/variation.integration.test.ts:4:freePort(57400,100)
packages/db/test/quote.integration.test.ts:4:freePort(56800,200)
packages/db/test/prevention-checks.integration.test.ts:27:freePort(59700,100)
packages/db/test/identity.integration.test.ts:26:freePort(57000,500)
packages/db/test/job-parties.integration.test.ts:128:freePort(58000,300)
packages/db/test/recovery-timing-pin.integration.test.ts:40:freePort(62500, 200)
packages/db/test/audit-export.integration.test.ts:29:58300 + Math.floor(Math.random() * 300)
packages/db/test/match-inbox-replay.integration.test.ts:33:freePort(60400, 99)
packages/db/test/recovery-cases.integration.test.ts:10:freePort(60000,200)
packages/db/test/things-replay.integration.test.ts:36:freePort(60900, 90)
packages/db/test/pool-test-utils.ts:15:freePort(base: number, span: number)
packages/db/test/free-port.test.ts:24:freePort(taken, 2)
packages/db/test/free-port.test.ts:28:freePort(taken, 1)
packages/db/test/contractor-parties.integration.test.ts:31:freePort(58500, 300)
packages/db/test/decision-inbox.integration.test.ts:5:freePort(56000,500)
packages/db/test/evidence-packs.integration.test.ts:20:freePort(60300, 200)
```

No reported numeric range contains 60200–60299. The five watchdog callers use span 400 (the harness expression above); the variable-port free-port helper tests are not assigned cluster ranges. Bootstrap's selected range is clear of the fixed browser port and every other assigned database-test range on this base.

Required URL-equivalence command (exit 0):

```sh
node -e 'const u=new URL("postgresql://127.0.0.1:60200/jobguard_synthetic_demo");u.username="neondb_owner";u.password=["a","b"].join("-");console.log(u.href===["postgresql://","neondb_owner",":","a-b","@","127.0.0.1:60200/jobguard_synthetic_demo"].join(""))'
```

```text
true
```

A second socket-free check also returned `true` (exit 0), comparing both real baseline address expressions at the same port with the new URL construction without printing either address or login value:

```sh
node - <<'JS'
const fs = require('node:fs');
const cp = require('node:child_process');
const source = cp.execFileSync('git', ['show', 'origin/main:packages/db/test/demo-bootstrap.integration.test.ts'], { encoding: 'utf8' });
const phrase = source.match(/^  const password = "([^"]+)";/m)[1];
const port = 60200, database = 'jobguard_synthetic_demo';
const expected = name => source.match(new RegExp('const '+name+' = `([^`]+)`'))[1].replaceAll('${password}', phrase).replaceAll('${port}', String(port)).replaceAll('${SYNTHETIC_DATABASE_NAME}', database);
const address = (user, value) => { const url = new URL(`postgresql://127.0.0.1:${port}/${database}`); url.username = user; url.password = value; return url.href; };
console.log(address('neondb_owner', phrase) === expected('ownerUrl') && address('jobguard_runtime', ['runtime','synthetic','only'].join('-')) === expected('runtimeUrl'));
JS
```

## F3 — DONE (implementation; PostgreSQL proof NOT RUN)

`tenancy.integration.test.ts`: the single port line changes from `freePort(55432, 500)` to `freePort(55433, 499)`, excluding only 55432. The nine tests, catalogue, role checks, expectations and `60_000` hook budget are unchanged.

Command: `git diff origin/main --numstat -- packages/db/test/tenancy.integration.test.ts`; exit 0:

```text
1	1	packages/db/test/tenancy.integration.test.ts
```
Changed lines (`git diff origin/main -U0 -- packages/db/test/tenancy.integration.test.ts`, exit 0):

```diff
-  port = await freePort(55432, 500);
+  port = await freePort(55433, 499);
```

Stated limit of F1–F3: the probe-to-bind gap remains, and F1's 58300–58599 range still overlaps 58000–58499 and 58500–58799, so another process may take a chosen port between probing and cluster startup.

## F4 — DONE (implementation; PostgreSQL proof NOT RUN)

Test: `Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact`. Added `let gaveUp = false;` after the retry declaration; only the deadline branch sets it true immediately before the unchanged named throw. Both earlier loop branches, the 20-second deadline, 25 ms poll, query, locks, nine existing expectations and `60_000` budget are unchanged.

Before finally:

```ts
    } finally {
      await connectionA.query("ROLLBACK"); connectionA.release();
      if (retry) await retry.catch(() => undefined);
      await connectionB.end();
    }
```

After finally:

```ts
    } finally {
      // After give-up, clean-up cannot throw and is limited to 5 seconds to preserve the named error; afterAll closes any stuck connection.
      if (gaveUp) {
        const cleanUp = (async () => {
          try { await connectionA.query("ROLLBACK"); } finally { connectionA.release(); }
          if (retry) await retry.catch(() => undefined);
          await connectionB.end();
        })().catch(() => undefined);
        await Promise.race([cleanUp, new Promise<void>(resolve => setTimeout(resolve, 5_000))]);
      } else {
        await connectionA.query("ROLLBACK"); connectionA.release();
        if (retry) await retry.catch(() => undefined);
        await connectionB.end();
      }
    }
```

A passing run exercises only the `gaveUp === false` side, which is today's code; the give-up side is shown by reading. This sandbox ran neither side. The give-up cleanup catches its own failure, releases connection A even if rollback refuses, and races the same three cleanup steps against 5 seconds to preserve the named error.

Remaining limit of F4: on the give-up path the second connection may still be open when the test ends.

## F5 — DONE (test added; PostgreSQL proof NOT RUN)

Added before F4's edit, after the existing parity test: `R1 parity (first entry): database-written audit entries that start an empty chain hash exactly as audit.ts hashes them`, with `30_000` budget. Imports both audit functions, schedules and advances normally, requires more than two existing entries, then uses one admin client and a rolled-back transaction to delete only the practice tenant's chain in replica mode, reset its head, restore origin mode and the tenant context, and reevaluate the same run. All values are SQL-bound parameters.

New assertions require the delete count to equal the original count, one head reset, zero new due Decisions, exactly the two expected event types at sequences 1 and 2, a null first previous hash, the second link to equal the first event hash, the exact subject and system actor on every row, canonical hash parity for every row, and successful whole-chain verification. After rollback it requires the original row count and re-verifies the real chain. The SELECT uses the same thirteen columns/aliases as the unchanged helper and runs on that client.

Source inspection of the unchanged 0115 evaluator supports this setup: it finds missing persisted due audit IDs for this run, returns zero because its due row already exists, locks the reset head and rewrites both facts. This is source-inspected only; the Mac helper must prove it. Per dispatch Q3, if the Mac run fails in its own setup, strike F5 and report it without a repair round. The only added DELETE is inside this always-rolled-back transaction; no product code or migration changed.

## F6 — DONE (implementation; PostgreSQL proof NOT RUN)

`recovery-timing-pin.integration.test.ts`: set-up hook budget `120_000` → `40_000`; `[AC9] populated upgrade preserves every stored row, earlier routine and table shape; reapply is inert` budget `60_000` → `15_000`. No other byte in this file changed; all 27 expanded tests require the Mac run.

Command: `git diff origin/main --numstat -- packages/db/test/recovery-timing-pin.integration.test.ts`; exit 0:

```text
2	2	packages/db/test/recovery-timing-pin.integration.test.ts
```
Before/after:

```diff
-}, 120_000);
+}, 40_000);
-}, 60_000);
+}, 15_000);
```

Diff-shape command:

```sh
git diff origin/main -U0 -- packages/db/test/recovery-timing-pin.integration.test.ts | grep -E '^[-+]' | grep -v -E '^(\+\+\+|---)' | grep -v -E '^[-+][[:space:]]*\}([[:space:]]*,[[:space:]]*[0-9_]+)?[[:space:]]*\);[[:space:]]*$'
```
Output: empty; exit 1 from the last grep (no mismatching lines), the required shape result.

## Four time numbers

| File | Test/hook | Before | After | Reason |
|---|---|---|---|---|
| recovery-timing-pin.integration.test.ts | beforeAll cluster/migrations | 120_000 | 40_000 | Issued F6 measured-time multiple; shorter |
| recovery-timing-pin.integration.test.ts | AC9 populated upgrade | 60_000 | 15_000 | Issued F6 measured-time multiple; shorter |
| recovery-follow-up.integration.test.ts | New first-entry parity test | Absent | 30_000 | New F5 test budget |
| recovery-follow-up.integration.test.ts | Round 1 B cleanup after named give-up | Absent | 5_000 | F4 bounded internal wait, not a Vitest budget |

No existing assertion, expected value or test name was changed, and no time limit was added or made longer except as listed. The thirteen FIXLATER-3 budgets were not touched. Assertion-change exceptions: none.

## Commands, exits and evidence

Dependencies were already installed; no install or package-download command was run. Runtime: Node `v24.17.0`; pinned pnpm `10.28.1`. The default PATH launcher was pnpm 11 and stalled after an ignored-overrides warning; the initial `pnpm typecheck` launch was interrupted (exit 130) before any task log. For executable checks below, PATH prefixed `/private/tmp/jg-fixlater-4-bin`, whose pnpm wrapper runs the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. It returned `10.28.1` for `pnpm --version` (exit 0). Nothing in repository tooling or environment configuration changed.

| Exact executable-check command (with that PATH prefix) | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful tasks, 4 cached, 16.347 s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (129 files); lane checker refuses self-comparison because HEAD equals origin/main; later lint steps did not run |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same fail-closed self-comparison rejection |
| `pnpm build` | 0 | 7 successful tasks, 4 cached, 48.328 s; static generation completed |
| `pnpm openapi:check` | 1 | tsx IPC server cannot listen: EPERM; generator check did not execute |
| `git diff --check` | 0 | Empty output |

Typecheck does not read `packages/db/test`, so it cannot vouch for these edits. Build is also not PostgreSQL proof. Turbo logged sandbox IO warnings; successful exits above are actual exits. The IPC denial was recorded without attempting an alternate OpenAPI execution route. Lint and lane lint need rerunning after the dispatcher commits; the comparison guard was not altered or bypassed.

Parse-only command (exit 0):

```sh
node - <<'JS'
const ts = require('typescript');
const fs = require('node:fs');
const files = ['audit-export', 'demo-bootstrap', 'tenancy', 'recovery-follow-up', 'recovery-timing-pin'].map(name => `packages/db/test/${name}.integration.test.ts`);
let errors = 0;
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext } });
  const diagnostics = result.diagnostics ?? [];
  console.log(`${file}: ${diagnostics.length} parse diagnostics`);
  for (const diagnostic of diagnostics) console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  errors += diagnostics.length;
}
process.exitCode = errors ? 1 : 0;
JS
```

```text
packages/db/test/audit-export.integration.test.ts: 0 parse diagnostics
packages/db/test/demo-bootstrap.integration.test.ts: 0 parse diagnostics
packages/db/test/tenancy.integration.test.ts: 0 parse diagnostics
packages/db/test/recovery-follow-up.integration.test.ts: 0 parse diagnostics
packages/db/test/recovery-timing-pin.integration.test.ts: 0 parse diagnostics
```
This only transpiles source text; it loads none of the test files, performs no type analysis and is not a test run.

Credential-shape command:

```sh
git diff origin/main -U0 | grep -E '^\+' | grep -v '^+++' | grep -n -i -E "(password|secret|token|key)[a-z_]*['\"]?[[:space:]]*[:=][[:space:]]*['\"\`][^'\"\`]{10,}|://[^/[:space:]'\"\`]+:[^/[:space:]'\"\`]+@"
```
Output: empty; exit 1 from the last grep (no added matching lines), as required. The untracked receipt and intended commit message were checked separately with the same expression applied to `git diff --no-index -U0 -- /dev/null <path>`: both produced empty output, exit 1 (no matching lines). This matters because `git diff origin/main` does not include untracked files. The final tracked-diff scan was also empty, exit 1.

`git diff origin/main --numstat` (exit 0; receipt is untracked and therefore absent from this output):

```text
1	0	config/agent-lane-assignments.json
2	2	packages/db/test/audit-export.integration.test.ts
10	4	packages/db/test/demo-bootstrap.integration.test.ts
51	4	packages/db/test/recovery-follow-up.integration.test.ts
2	2	packages/db/test/recovery-timing-pin.integration.test.ts
1	1	packages/db/test/tenancy.integration.test.ts
```

## NOT RUN inventory

Every entry below, including every expansion of a parameterized title: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No test runner was invoked. This also records no full repository/package suite, no database/migration/deploy suite, no Playwright suite, no unit-only substitution. No AI change; eval is inapplicable. Historical main counts from the dispatch are 11, 4, 9, 60 and 27; with F5 the planned Mac count is 112 total (61 recovery-follow-up), not an observed result here.

### packages/db/test/audit-export.integration.test.ts

- `leaves every existing table, policy, routine privilege and runtime role attribute unchanged on upgrade` — NOT RUN
- `exports one tenant only, including shared-user tenants, with its own audit event and distinct public key` — NOT RUN
- `requires a trusted handoff and rolls back creation/audit on failure` — NOT RUN
- `replays racing command IDs once and persists one audited effect` — NOT RUN
- `allows only current tenant-wide owner/admin and durably audits every other role's create/list refusal` — NOT RUN
- `catalogs append-only tenant-qualified tables and denies missing-context, cross-tenant, mutation and checkpoint privilege attacks` — NOT RUN
- `refuses creation server-side in %s (all parameterized cases)` — NOT RUN
- `audits the revoked session member's %s refusal through the application boundary (all parameterized cases)` — NOT RUN
- `serializes distinct concurrent export commands on two connections into consistent verifiable snapshots` — NOT RUN

### packages/db/test/demo-bootstrap.integration.test.ts

- `binds the synthetic small-builder track in the fixture transaction before going live` — NOT RUN
- `creates roles, applies every registered migration, reports the actual total, seeds once, and keeps pooled RLS local` — NOT RUN
- `creates and commits the subsequent builder origin using the actual runtime role` — NOT RUN
- `refuses an environment or database not explicitly synthetic` — NOT RUN

### packages/db/test/tenancy.integration.test.ts

- `allows a same-tenant read and denies a cross-tenant read even with a wrong filter` — NOT RUN
- `applies WITH CHECK to inserts, updates, and changed tenant_id` — NOT RUN
- `allows same-tenant insert, update, and delete operations` — NOT RUN
- `limits deletes and rejects cross-tenant composite references without disclosure` — NOT RUN
- `fails closed for missing/malformed context and does not retain pooled tenant state` — NOT RUN
- `rolls back domain writes when work fails` — NOT RUN
- `supports a fresh migration and idempotent upgrade` — NOT RUN
- `automatically finds every business table protected by enabled and forced RLS plus a check policy` — NOT RUN
- `keeps runtime and infrastructure roles unprivileged` — NOT RUN

### packages/db/test/recovery-follow-up.integration.test.ts

- `is a reviewed act bound to a delivered message, the case revision seen and one practice run, with exactly one persisted owner` — NOT RUN
- `refuses without a delivered message, a stale case revision, a practice run, or twice at once` — NOT RUN
- `is idempotent by command id: the same command replays, a different request with that id conflicts, and a message command id cannot be reused` — NOT RUN
- `DW1: passing the due time gives Review reminder with no new simulated message, and the sink is untouched` — NOT RUN
- `Q1: the due Decision is written by the same transaction as SBOX-2's own advance of the run's fake clock` — NOT RUN
- `Q1: when the due evaluation fails, SBOX-2's advance rolls back with it, and the same follow-up then becomes due normally` — NOT RUN
- `leaves SBOX-2 exactly as it was for a run that has no follow-up` — NOT RUN
- `refuses to schedule on a clock with no time left, and an archived run can no longer be advanced` — NOT RUN
- `DW2: advancing any amount of fake time creates no approval, authorization, outbox action, message or sink row` — NOT RUN
- `DW2: the reminder opens through the M4-5-S message path and is only a preview: nothing is authorized or sent` — NOT RUN
- `DW2: only the exact reminder is approved; any changed body, recipient, amount, pack or hash is refused as changed and approves nothing` — NOT RUN
- `DW2: an older preview cannot be approved once a newer one exists; only the newest exact reminder can be` — NOT RUN
- `DW2: the exact approval resolves the follow-up's own due Decision and queues one action; delivery records exactly one sink row` — NOT RUN
- `keeps M4-5-S's one-effect rule everywhere else: no preview before the due time, none while a reminder is queued, none after it is delivered` — NOT RUN
- `DW3: repeated and racing advances leave exactly one due Decision and one owner, with no duplicate transition, journal or send` — NOT RUN
- `DW3: duplicated due signals, from several connections and a restarted process, create the one due Decision once` — NOT RUN
- `DW3: a signal for another tenant's, or a missing, run does nothing and discloses nothing` — NOT RUN
- `DW3: an advance command replays its first result; the same id for another request, or from another command family, is a conflict` — NOT RUN
- `DW4: a cancellation is recorded once, shows Stopped, and a later advance creates no due Decision` — NOT RUN
- `DW4: a stale cancel is refused` — NOT RUN
- `DW4: %s shows Stopped, and a later advance creates no due Decision (all parameterized cases)` — NOT RUN
- `DW4: a case fact after the reminder is due also shows Stopped, and nothing more can be previewed or approved` — NOT RUN
- `DW4: an archived practice run stops its follow-up` — NOT RUN
- `DW5: revoking the approval behind a pending reminder shows Approval needed again, blocks execution and writes no sink row` — NOT RUN
- `DW5: a fresh reviewed reminder after a revocation needs its own approval, makes its own Decision, and sends exactly once` — NOT RUN
- `DW5: a reminder cannot be cancelled away while its approval stands` — NOT RUN
- `DW5: a reminder queued for delivery is never recorded as delivered once its practice run has been archived` — NOT RUN
- `DW6: the old follow-up stays stopped and is never reused; nothing is created until a new reviewed follow-up exists` — NOT RUN
- `DW6: a landing reversed after a close also reopens the case, and still revives nothing` — NOT RUN
- `every table is tenant-owned with a non-null tenant id, forced row security, migration ownership and runtime SELECT/INSERT only` — NOT RUN
- `denies the runtime role any UPDATE, DELETE or TRUNCATE, so history and the cancellation are append-only` — NOT RUN
- `shows nothing and accepts nothing without a tenant context, and nothing to another tenant` — NOT RUN
- `refuses an actor who is not an active owner` — NOT RUN
- `ties every row to its own tenant, job and case by composite foreign keys: a same-tenant wrong job or wrong case cannot be linked` — NOT RUN
- `is synthetic only: a production or pilot environment is refused by the database, and the contract carries no mode at all` — NOT RUN
- `has exactly one persisted owner per follow-up, which must be the intent's own run, and no intent exists without its owner and scheduled event` — NOT RUN
- `refuses a hand-made follow-up that is not on the case's delivered message, the case as reviewed, or its own session's active run` — NOT RUN
- `refuses a hand-made due row unless the follow-up's own clock reached its due tick and its Decision is a pending, unauthorized one` — NOT RUN
- `refuses a hand-made reminder link or approval that is not the newest preview of an open, due follow-up` — NOT RUN
- `reads case facts identically in SQL and in followUpCaseFacts for every ending and reopening event, at every review point` — NOT RUN
- `appends an identifier-only audit event for each step, exactly once, in a chain that still verifies` — NOT RUN
- `R1: direct SBOX-2 advance audits the due transition in the Decision/event transaction without a follow-up read` — NOT RUN
- `R1: a failure after the atomic due audit rolls back the clock, Decision, due row, event and audit together` — NOT RUN
- `R1 DW6: delivered message 1 remains the source after reminder 2 is approved, revoked, closed and reopened, through exact reminder 3 delivery` — NOT RUN
- `R1: a later %s attempt still refuses the delivered source in the repository and raw SQL guard (all parameterized cases)` — NOT RUN
- `Round 1 A: cancelling a follow-up with an unapproved reminder permits scheduling from delivered message 1` — NOT RUN
- `Round 1 A: an unapproved reminder survives close and reopen without blocking a fresh run through exact reminder delivery` — NOT RUN
- `Round 1 A: a live follow-up with an unapproved preview retains ALREADY_ACTIVE and its delivered scheduling source` — NOT RUN
- `Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact` — NOT RUN
- `R1 parity: audit entries written by the database hash exactly as audit.ts hashes them` — NOT RUN
- `R1 parity (first entry): database-written audit entries that start an empty chain hash exactly as audit.ts hashes them` — NOT RUN

### packages/db/test/recovery-timing-pin.integration.test.ts

- `[AC1] ordinary insert triggers and invoker function have the exact catalog shape` — NOT RUN
- `[AC2] timing pin fires first on %s and merged insert guards remain (all parameterized cases)` — NOT RUN
- `[AC3] runtime case back-dating attempt ignores chosen time %s (all parameterized cases)` — NOT RUN
- `[AC3] valid runtime advance ignores chosen time %s (all parameterized cases)` — NOT RUN
- `[AC4] %s case insert is pinned in ordinary mode (all parameterized cases)` — NOT RUN
- `[AC5] product case and settled event use their transaction clock within server readings` — NOT RUN
- `[AC6] %s settled then raw case with chosen past time remains excluded (all parameterized cases)` — NOT RUN
- `[AC6] %s opened then raw settled row with chosen past time retains full figure (all parameterized cases)` — NOT RUN
- `[AC6] F18 raw settled row with chosen future time then product opening remains excluded` — NOT RUN
- `[AC6] %s product-only controls preserve both money answers and replay (all parameterized cases)` — NOT RUN
- `[AC7] runtime cannot update or remove a visible %s row after insert (all parameterized cases)` — NOT RUN
- `[AC7] owner case rewrite is refused by the merged append-only trigger` — NOT RUN
- `[AC7] %s cannot select, insert or update either table (all parameterized cases)` — NOT RUN
- `[AC7] catalog denies every non-owner application role mutation; feed owner remains privileged (control)` — NOT RUN
- `[AC8] merged superuser UPDATE time-seeding pattern still works unaltered (control)` — NOT RUN
- `[AC9] populated upgrade preserves every stored row, earlier routine and table shape; reapply is inert` — NOT RUN
- `[AC10] registry is sorted, unique and places the pin after its two dependencies` — NOT RUN
- `[AC11] contract and migration record retain the stated boundary and forward-fix instructions` — NOT RUN

## Self-review

Re-read the whole diff against the issued order. Only the five test files, this receipt and the lane entry changed. Lane addition is exactly one compact line after fixlater-3, with exactly the seven allowed path entries; other lane entries are unchanged. F1 numstat is 2/2, F3 1/1, F6 2/2, lane 1/0. Bootstrap changes are confined to its import and the permitted setup block; its original line 50, first describe and cluster construction onward are byte-identical. Recovery-follow-up changes consist solely of F4's flag, give-up branch and finally, plus the one appended F5 test. No existing expectation or title differs; no skip, todo, only, retry wrapper or standing byte/hash freeze added. Millisecond changes are exactly the four listed. No added credential-shaped line; the single new DELETE is enclosed by BEGIN and unconditional finally rollback on the same client.

Transient socket-free source comparison (no permanent test), `node /private/tmp/jg-fixlater-4-self-review.cjs`, exit 0:

```text
packages/db/test/audit-export.integration.test.ts: 7 literal test declarations and 54 assertion statements unchanged
packages/db/test/demo-bootstrap.integration.test.ts: 4 literal test declarations and 21 assertion statements unchanged
packages/db/test/tenancy.integration.test.ts: 9 literal test declarations and 16 assertion statements unchanged
packages/db/test/recovery-follow-up.integration.test.ts: 48 literal test declarations and 253 assertion statements unchanged
packages/db/test/recovery-timing-pin.integration.test.ts: 9 literal test declarations and 62 assertion statements unchanged
demo-bootstrap: first describe, login declaration and everything from cluster construction onward unchanged
all changed/untracked paths are in the exact FIXLATER-4 allowlist
```

This source comparison reports literal `it` declarations and expression-statement assertions, not executed test counts; parameterized titles and all remaining source were also read in the diff. The original SQL queries, unchanged time limits, lock order and earlier loop branches were inspected. No self-review repair was necessary.

Shared-file coordination: tenancy and bootstrap are shared with SV-3, SV-4 and M4-8-S; branch-conflict checking remains assigned to the Mac helper and reviewers under dispatch Q4, with any conflict resolved at those branches' catch-up merges. ENT-10b-OPS's historical byte-identical claims and CTX-BRIDGE-1's historical unedited-run claim do not describe this new diff. This builder made no edits in those lanes. Probe-to-bind and possible lingering cleanup connection are the stated limits above; the three SV-2 blind-port files and FIXLATER-3 budgets remain outside this batch.

Remaining gates: Mac PostgreSQL runs for F1–F6, committed-head lint/lane checks, OpenAPI in an environment permitting tsx IPC, green CI on the exact head, fresh Opus + Sol RED checks, and separate acceptance. No independent verdict or acceptance is claimed. Generated ignored dist, .next, .turbo and web tsbuildinfo outputs/caches were removed after validation (cleanup exit 0, with a tracked-file guard); a final cleanup inspection also found an untracked .pnpm-store/v11 directory, removed it with the same tracked-file guard, and confirmed no .pnpm-store, test-results, root .turbo or web .next remains (exit 0). Intended conventional commit subject/body is written to `/private/tmp/jg-msg-fixlater-4.txt`.

Builder receipt only — not independently verified, not accepted.
