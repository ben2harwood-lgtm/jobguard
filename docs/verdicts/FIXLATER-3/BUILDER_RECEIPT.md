# FIXLATER-3 builder receipt

Builder receipt only — not independently verified, not accepted.

## Base and scope

Issued 11 October 2026 by the integrator. Base and unchanged HEAD: `4564e888b85aba559c542e935e52fe9f78769595`; branch `codex/sandbox/fixlater-3`. Clean working tree at entry; supplied `origin/main` matches HEAD. No fetch, Git mutation, commit, push, package download or dependency change. The dispatcher owns the commit and GitHub run.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.1–2.4, 5.3, 5.6 and M4-6-S, `docs/contracts/audit-v1.md`, the affected helpers, audit implementation and migration 0115. The issued order controls this routine stability repair. No contract, production code, schema, migration, stored data, UI or release policy changed. No new operational alerts or backwards-compatibility impact. Existing assertion expectations and audit-chain coverage are preserved; F8 adds direct database/application hash parity coverage.

First mutation: inserted exactly one compact `fixlater-3` lane line directly after `fixlater-2`, with the issued note and exactly the ten allowed file paths plus the receipt folder. Other lane lines remain byte-identical. F2(e) is retained as expressly issued; no competing extra-origin upgrade edit was observed in this worktree. Overlapping follow-up edits F8/F4/F5 were serialized in this task, with F8 written first. Shared registry ownership is limited to this single new lane line.

## F1–F9 implementation

All DONE labels below mean implemented and source-inspected; they do not claim execution or acceptance.

### F1 — DONE

- F1, `packages/db/test/prevention-checks.integration.test.ts`, `upgrades the previous supported schema without altering an existing quoting job` (base closing line 199): `  });` → `  }, 60_000);`. Whole migration list; matches the existing setup budget.

### F2 — DONE

- F2(a), `packages/db/test/job-parties.integration.test.ts`, `fresh installation invents no non-synthetic parties and raises details-needed Decisions` (base closing line 296): `  });` → `  }, 60_000);`. Fresh installation replays the whole migration list.
- F2(b), `packages/db/test/job-parties.integration.test.ts`, `applies the full migration chain to a SQL_ASCII database without UTF8 encoding` (base closing line 314): `  });` → `  }, 60_000);`. SQL_ASCII installation replays the whole migration list.
- F2(c), `packages/db/test/job-activation-terms.integration.test.ts`, `upgrades from the schema just before CH-1's migration without rewriting v1 commercial rows` (base closing line 121): ` });` → ` }, 60_000);`. Upgrade replays the migration list without rewriting v1 rows.
- F2(d), `packages/db/test/recovery-message-upgrade.integration.test.ts`, `keeps the runner idempotent and the previous release path working` (base closing line 94): `  });` → `  }, 60_000);`. Idempotent runner/previous-release path replays migrations.
- F2(e), `packages/db/test/extra-origin-upgrade.integration.test.ts`, `[S8] preserves old columns and fixture origins, adds only NULL columns; migrator idempotent and ordered` (base closing line 48): ` });` → ` }, 120_000);`. Also starts a second whole cluster and applies the full migration list.

### F3 — DONE

- F3(a), `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`, `beforeAll` (base closing line 157): `});` → `}, 120_000);`. Starts a cluster, applies earlier migrations and builds several legacy messages.
- F3(b), `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`, `applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege` (base closing line 202): `  });` → `  }, 60_000);`. Applies both repair migrations and compares populated rows and privileges.
- F3(c), `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`, `preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending` (base closing line 253): `  });` → `  }, 60_000);`. Exercises legacy messages and applies the remaining growing migration list.

### F4 — DONE

- F4(a), `packages/db/test/recovery-follow-up.integration.test.ts`, `R1 DW6: delivered message 1 remains the source after reminder 2 is approved, revoked, closed and reopened, through exact reminder 3 delivery` (base closing line 920): `  });` → `  }, 90_000);`. Long reopened-case journey; matches the existing 90-second sibling budgets.
- F4(b), `packages/db/test/recovery-follow-up.integration.test.ts`, `Round 1 A: an unapproved reminder survives close and reopen without blocking a fresh run through exact reminder delivery` (base closing line 986): `  });` → `  }, 90_000);`. Long reopened-case journey; matches the existing 90-second sibling budgets.

### F5 — DONE

- F5, `packages/db/test/recovery-follow-up.integration.test.ts`, `Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact` (base closing line 1055): `  });` → `  }, 60_000);`. Allows the separate 20-second polling deadline to fire before the test budget.

Added `const waitDeadline = Date.now() + 20_000;` immediately before `let blocked = false;`; added the deadline error branch after the unchanged `retryFinished` branch; reworded only the named comment; added only the issued 60-second test budget. The 25 ms pause, query, both original branches, locks, finally block and every expectation are unchanged. Before/after loop appears below.

### F6 — DONE

`packages/db/test/free-port.test.ts`, `skips a port another process is listening on (other tools sit inside the test port ranges)`: setup `const taken = await occupy(0, "127.0.0.1");` → `const taken = await occupyWithFreeNeighbour();`. The file-local helper holds up to 20 system-assigned IPv4 listeners through the unchanged `occupy`/`afterEach`, requires the candidate below 65535, and probes its neighbour on both loopbacks, closing successful probes. Only IPv6 `EADDRNOTAVAIL`/`EAFNOSUPPORT` means no conflict. Exhaustion throws a setup error; no skip. The existing twenty-call expectation is byte-identical.

Known limit: another program could still take the neighbour in the few milliseconds between the probe and the twenty calls.

### F7 — DONE

`packages/db/test/free-port.test.ts`, `gives up with a clear error when every port in the range is in use`: `const taken = await anyFree(); await occupy(taken, "127.0.0.1");` → `const taken = await occupy(0, "127.0.0.1");`. Removed the now-unused `anyFree` helper. The listener stays held until the unchanged `afterEach`; the existing error expectation is byte-identical.

### F8 — DONE

Appended `R1 parity: audit entries written by the database hash exactly as audit.ts hashes them` after Round 1 B inside the existing R1 describe, with its own `60_000` budget. It creates a scheduled follow-up and advances once, reads the thirteen audit columns with the existing aliases/casts/trims, filters by parameter-bound tenant/subject/follow-up/system actor, orders by sequence and requires exactly the two issued event types. Each stored event hash is compared directly to dynamically imported `canonicalAuditHash(row)`. Parameter-bound due/clock queries require one row each; both payloads and the due audit ID are checked exactly; it ends with unchanged `verifyChain()`. All SQL predicate values are bound parameters. No existing helper or import line changed.

Source inspection: migration 0115 constructs those two payloads in canonical key order, chains the same ten metadata fields with character 31, and truncates timestamps to milliseconds as `audit.ts` expects. This supports adding the strict test unchanged; it is not an executed parity result.

### F9 — DONE

`packages/db/test/fingerprinted-row-shape.integration.test.ts`, the cluster/migration `beforeAll` closing line 83: `});` → `}, 120_000);`. Exactly one line changed; all lists, assertions, bodies, port and teardown remain byte-identical.

## Thirteen added time budgets on existing tests/hooks

No existing assertion, expected value, test name or existing time limit was changed. Expectation-change exception list: empty. These are the only thirteen default-to-explicit budget changes; F8 is a new test with its own 60,000 ms budget, separate from this list. No other budget was added or changed.

| Item | File under `packages/db/test/` | Test or hook | Before | After (ms) | Reason |
|---|---|---|---|---:|---|
| F1 | `prevention-checks.integration.test.ts` | upgrades the previous supported schema without altering an existing quoting job | default (5,000 ms) | 60,000 | Whole migration list; matches the existing setup budget. |
| F2(a) | `job-parties.integration.test.ts` | fresh installation invents no non-synthetic parties and raises details-needed Decisions | default (5,000 ms) | 60,000 | Fresh installation replays the whole migration list. |
| F2(b) | `job-parties.integration.test.ts` | applies the full migration chain to a SQL_ASCII database without UTF8 encoding | default (5,000 ms) | 60,000 | SQL_ASCII installation replays the whole migration list. |
| F2(c) | `job-activation-terms.integration.test.ts` | upgrades from the schema just before CH-1's migration without rewriting v1 commercial rows | default (5,000 ms) | 60,000 | Upgrade replays the migration list without rewriting v1 rows. |
| F2(d) | `recovery-message-upgrade.integration.test.ts` | keeps the runner idempotent and the previous release path working | default (5,000 ms) | 60,000 | Idempotent runner/previous-release path replays migrations. |
| F2(e) | `extra-origin-upgrade.integration.test.ts` | [S8] preserves old columns and fixture origins, adds only NULL columns; migrator idempotent and ordered | default (5,000 ms) | 120,000 | Also starts a second whole cluster and applies the full migration list. |
| F3(a) | `recovery-follow-up-upgrade.integration.test.ts` | beforeAll | default (10,000 ms) | 120,000 | Starts a cluster, applies earlier migrations and builds several legacy messages. |
| F3(b) | `recovery-follow-up-upgrade.integration.test.ts` | applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege | default (5,000 ms) | 60,000 | Applies both repair migrations and compares populated rows and privileges. |
| F3(c) | `recovery-follow-up-upgrade.integration.test.ts` | preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending | default (5,000 ms) | 60,000 | Exercises legacy messages and applies the remaining growing migration list. |
| F4(a) | `recovery-follow-up.integration.test.ts` | R1 DW6: delivered message 1 remains the source after reminder 2 is approved, revoked, closed and reopened, through exact reminder 3 delivery | default (5,000 ms) | 90,000 | Long reopened-case journey; matches the existing 90-second sibling budgets. |
| F4(b) | `recovery-follow-up.integration.test.ts` | Round 1 A: an unapproved reminder survives close and reopen without blocking a fresh run through exact reminder delivery | default (5,000 ms) | 90,000 | Long reopened-case journey; matches the existing 90-second sibling budgets. |
| F5 | `recovery-follow-up.integration.test.ts` | Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact | default (5,000 ms) | 60,000 | Allows the separate 20-second polling deadline to fire before the test budget. |
| F9 | `fingerprinted-row-shape.integration.test.ts` | beforeAll | default (10,000 ms) | 120,000 | Starts a PostgreSQL cluster and applies the whole migration list. |

## F5 loop before and after

Before:

```ts
      // Observe PostgreSQL's actual lock wait, pausing briefly between polls; no test retries or extra timeout.
      let blocked = false;
      while (!blocked) {
        await new Promise<void>(resolve => setTimeout(resolve, 25));
        const activity = (await admin.query(`SELECT wait_event_type,query,pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE pid=$1`, [pidB])).rows[0];
        blocked = activity?.wait_event_type === "Lock" && activity.blockers.includes(pidA);
        if (blocked) expect(activity.query).toContain("recovery-follow-up-audit");
        else if (retryFinished) { await retry; throw new Error("retry finished without waiting on the audit key"); }
      }
```

After:

```ts
      // Observe PostgreSQL's actual lock wait, pausing briefly between polls; give up with a named error after 20 seconds, with nothing retried.
      const waitDeadline = Date.now() + 20_000;
      let blocked = false;
      while (!blocked) {
        await new Promise<void>(resolve => setTimeout(resolve, 25));
        const activity = (await admin.query(`SELECT wait_event_type,query,pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE pid=$1`, [pidB])).rows[0];
        blocked = activity?.wait_event_type === "Lock" && activity.blockers.includes(pidA);
        if (blocked) expect(activity.query).toContain("recovery-follow-up-audit");
        else if (retryFinished) { await retry; throw new Error("retry finished without waiting on the audit key"); }
        else if (Date.now() > waitDeadline) { throw new Error("retry neither waited on the audit key nor finished within 20 s"); }
      }
```

## Environment and commands actually run

Node `v24.17.0`, cached pinned pnpm `10.28.1`, supplied TypeScript `5.8.3`, Vitest `4.1.11`, Turbo `2.10.12`. No clean reinstall was attempted: downloads are prohibited and dependencies were already installed. The default `pnpm --version` launcher stalled and was interrupted, exit 130. Created a temporary symlink `/private/tmp/jg-fixlater-3-bin/pnpm` to the existing `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; `PATH="/private/tmp/jg-fixlater-3-bin:$PATH" pnpm --version` printed `10.28.1`, exit 0. All pnpm checks below used that PATH prefix.

| Exact command (after PATH prefix) | Exit | Actual result |
|---|---:|---|
| `pnpm typecheck` (once) | 0 | 7/7 tasks successful, 4 cache hits; 23.546 s. |
| `LANE_BASE_REF=origin/main pnpm lint` (once) | 1 | Core purity passed (129 TypeScript files); lane checker refused HEAD equal to origin/main. Remaining combined boundary/package lint did not run. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (once) | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm build` (once, dispatcher environment instruction) | 0 | 7/7 tasks successful, 4 cache hits; 45.887 s; Next generated 27/27 static pages. |
| `pnpm openapi:check` | 1 | tsx CLI failed on its IPC listen with EPERM; comparison did not execute. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/comparison executed without the CLI IPC socket; empty output. |
| `node tools/money-arithmetic-lint.mjs` | 0 | `Money arithmetic boundary check passed.` |
| `node tools/commercial-boundary-lint.mjs` | 0 | Empty output. |
| `node /private/tmp/jg-fixlater-3-parse.cjs` | 0 | Nine changed test files; zero diagnostics; exact script and output below. |
| Issued F1–F3 grep pipeline (below) | 1 | Empty output as required; final grep returns 1 because no nonconforming line matched. |
| `git diff origin/main --numstat` | 0 | Ten tracked paths; 60 additions, 17 removals, output below. Untracked receipt is omitted by git diff. |
| `git diff origin/main --numstat -- packages/db/test/fingerprinted-row-shape.integration.test.ts` | 0 | Exactly `1	1` plus the file path, output below. |
| `git diff origin/main --numstat --` followed by the six F1–F3 paths | 0 | Six files total 9 additions and 9 removals, output below. |
| `node /private/tmp/jg-fixlater-3-self-review.cjs` (final) | 0 | Exact base reconstruction for every test file, lane-line preservation, all paths in scope; 116 test declarations. |
| `git diff --check` | 0 | Empty output. |

The first temporary self-review-script run exited 1 because its removal of the new test also removed one base newline. Corrected the temporary checker offset and reran; no repository edit was required. This is a deterministic builder check, not independent verification.

`pnpm typecheck` does not read `packages/db/test`; it cannot vouch for these edits. Parse/transpile checks do not typecheck imports or execute assertions. Turbo build/typecheck cache IO emitted existing sandbox permission warnings; cached tasks are not claimed as freshly executed. Build also reported workspace-root/CSS warnings. No socket-dependent unit test was run. No lint pass is claimed: the dispatcher must commit and GitHub must run the required lint/lanes and integration suites.

Logs are `/private/tmp/jg-fixlater-3-{typecheck,lint,lanes,build,openapi,openapi-direct,money,commercial,parse,shape,self-review}.log`.

## Parse-only evidence

Exact executed command: `node /private/tmp/jg-fixlater-3-parse.cjs` (exit 0). Script contents:

```js
const fs = require('node:fs');
const ts = require(process.cwd() + '/node_modules/typescript');
const files = [...new Set(JSON.parse(fs.readFileSync('/private/tmp/jg-fixlater-3-budgets.json')).map(entry => entry.file)), 'free-port.test.ts'];
let diagnostics = 0;
for (const file of files) {
 const fileName = 'packages/db/test/' + file;
 const result = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
  fileName, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
 });
 const errors = result.diagnostics ?? [];
 diagnostics += errors.length;
 console.log(`${fileName}: ${errors.length} parse/transpile diagnostics`);
 for (const error of errors) console.log(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
}
console.log(`${files.length} files parsed; ${diagnostics} diagnostics; no imports loaded, no test executed, no output emitted.`);
process.exitCode = diagnostics ? 1 : 0;
```

The manifest used by this script contains exactly the thirteen rows above, in that order. It deduplicates their eight file names and adds `free-port.test.ts`; no imports or built packages are loaded. `transpileModule` output is kept in memory and discarded. This is a parse/transpile check, not a test run.

Output:

```text
packages/db/test/prevention-checks.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/job-parties.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/job-activation-terms.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/recovery-message-upgrade.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/extra-origin-upgrade.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/recovery-follow-up-upgrade.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/recovery-follow-up.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/fingerprinted-row-shape.integration.test.ts: 0 parse/transpile diagnostics
packages/db/test/free-port.test.ts: 0 parse/transpile diagnostics
9 files parsed; 0 diagnostics; no imports loaded, no test executed, no output emitted.
```

## Diff-shape evidence

Exact issued command:

```sh
git diff origin/main -U0 -- packages/db/test/prevention-checks.integration.test.ts packages/db/test/job-parties.integration.test.ts packages/db/test/job-activation-terms.integration.test.ts packages/db/test/recovery-message-upgrade.integration.test.ts packages/db/test/extra-origin-upgrade.integration.test.ts packages/db/test/recovery-follow-up-upgrade.integration.test.ts | grep -E '^[-+]' | grep -v -E '^(\+\+\+|---)' | grep -v -E '^[-+][[:space:]]*\}([[:space:]]*,[[:space:]]*[0-9_]+)?[[:space:]]*\);[[:space:]]*$'
```

Output: empty (0 bytes). Pipeline exit 1 means the final grep matched no unexpected lines.

`git diff origin/main --numstat -- packages/db/test/prevention-checks.integration.test.ts packages/db/test/job-parties.integration.test.ts packages/db/test/job-activation-terms.integration.test.ts packages/db/test/recovery-message-upgrade.integration.test.ts packages/db/test/extra-origin-upgrade.integration.test.ts packages/db/test/recovery-follow-up-upgrade.integration.test.ts` (exit 0):

```text
1	1	packages/db/test/extra-origin-upgrade.integration.test.ts
1	1	packages/db/test/job-activation-terms.integration.test.ts
2	2	packages/db/test/job-parties.integration.test.ts
1	1	packages/db/test/prevention-checks.integration.test.ts
3	3	packages/db/test/recovery-follow-up-upgrade.integration.test.ts
1	1	packages/db/test/recovery-message-upgrade.integration.test.ts
```

`git diff origin/main --numstat -- packages/db/test/fingerprinted-row-shape.integration.test.ts` (exit 0):

```text
1	1	packages/db/test/fingerprinted-row-shape.integration.test.ts
```

`git diff origin/main --numstat` (exit 0):

```text
1	0	config/agent-lane-assignments.json
1	1	packages/db/test/extra-origin-upgrade.integration.test.ts
1	1	packages/db/test/fingerprinted-row-shape.integration.test.ts
14	3	packages/db/test/free-port.test.ts
1	1	packages/db/test/job-activation-terms.integration.test.ts
2	2	packages/db/test/job-parties.integration.test.ts
1	1	packages/db/test/prevention-checks.integration.test.ts
3	3	packages/db/test/recovery-follow-up-upgrade.integration.test.ts
35	4	packages/db/test/recovery-follow-up.integration.test.ts
1	1	packages/db/test/recovery-message-upgrade.integration.test.ts
```

The first block totals exactly 9 added and 9 removed; F9 prints exactly 1 added and 1 removed. The last block omits this untracked receipt; it is the sole additional path.

## NOT RUN — every test in all nine files

Zero test runs. All declarations below, including every parameterized `it.each` instance, are NOT RUN. The table totals 116 declarations including F8; declarations with placeholders retain their parameterized names. The fingerprinted guard runs its column-list template for all twelve pinned tables, also NOT RUN. No PostgreSQL, localhost listener or browser was started.

`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, package-wide/repository suites, browser/Playwright/regression/deploy suites: NOT RUN (sandbox cannot start PostgreSQL / a browser; whole suites are also prohibited by this order). No AI evaluation is applicable to this test-only change.

### `packages/db/test/prevention-checks.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- persists cited property facts for homeowners, replaying exactly once with atomic audit
- stale and missing fixtures are unknown for every check type, with explicit watch start/stop
- refuses every ineligible type server-side without a counterparty row
- denies missing context, non-members, wrong-job bindings and direct SQL tampering
- fails closed when the customer's latest revision is not eligible: new checks refuse and an existing watch yields nothing
- caps a sub-millisecond scenario time so TypeScript and the database evaluate the same instant
- leaves fee derivations, journals, recovery cases, illustrations, value inputs and outbound state byte-identical
- two distinct watch-start commands against one revision give one effect and a typed conflict
- an audit failure rolls back the receipt and all property facts
- owns and isolates both tables with narrow grants and immutable rows even for the owner
- upgrades the previous supported schema without altering an existing quoting job

### `packages/db/test/job-parties.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- rejects command and direct runtime SQL without persisting a site: %j
- keeps JavaScript trimming and UTF-16 length boundaries in UTF8
- refuses %s and rolls back the site identity and revision
- refuses %s and rolls back the customer identity and revision
- keeps valid maximum-length revisions readable in every parties workspace
- backfills synthetic jobs across all states with provenance and preserves earlier document bytes/hashes
- fails closed without tenant context, rejects foreign members, and keeps runtime grants narrow
- refuses live and adoption without parties in the PostgreSQL boundary and rolls back
- serializes concurrent bindings, deduplicates replay and conflicts on changed payloads
- proposes normalized matches without automatic reuse; different and unknown units stay separate
- groups shared identities and appends post-live corrections without changing historic bindings or snapshots
- uses composite foreign keys to reject cross-tenant parties and hides foreign identities
- keeps a job's exact bound %s revision when another job revises and binds the shared registry identity
- keeps customer revisions immutable, replayable and guarded by their expected revision
- fresh installation invents no non-synthetic parties and raises details-needed Decisions
- applies the full migration chain to a SQL_ASCII database without UTF8 encoding
- adopts through the dispatcher with command, authorization, result and audit recorded together
- rolls the command, authorization and job back together when the adoption fails inside the boundary
- refuses runtime SQL that carries no command or authorization, and creates nothing
- refuses each missing authority on its own: actor, authorization and receipt
- cannot commit a direct execution that records no result or no audit
- commits a direct execution that completes the receipt and appends both audit events, bound to the exact receipt and authorization
- cannot commit a binding change whose receipt is not completed or whose audit event is missing or does not match
- commits a binding change that completes its receipt and appends its audit event, linked to that exact command
- does not let one receipt authorize two binding effects
- refuses %s correction reasons in both routine and constraint with full receipt/audit rollback
- explicitly refuses a null post-live reason and accepts a trimmed nonblank boundary reason
- refuses a live job's binding change unless the correction flag is true, and rolls everything back
- isolates labels, unbound suggestions, recognition and forged registry references; an adopted job inherits only its source session
- issues the unchanged three home scenarios with a bound live example, empty quoting suggestions and isolated reusable identities
- refuses missing parties despite forged scenario, session and bypass settings on direct runtime INSERT and UPDATE
- rolls back the session and generated parties when the final home-job insert fails
- keeps duplicate, malformed and unauthorized issuance atomic with no extra jobs or parties

### `packages/db/test/job-activation-terms.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- owns the saved v1 sample per session and refuses a client pricing-generation switch
- DW1/DW5 generates three named fixtures through the real command, without historic financial effects
- binds a higher sent net even when the accepted net is small
- DW1 replays, serializes two clients and rejects command-id reuse with a different payload
- keeps parties mandatory and rolls failed activation back before audit
- DW4 denies runtime edits and keeps classification after later commercial activity
- fails closed for missing/foreign contexts, non-members and wrong-job accepted documents
- rechecks revoked membership before replaying a successful activation
- inspects actual catalog privileges, RLS, owner and qualified keys
- upgrades from the schema just before CH-1's migration without rewriting v1 commercial rows
- DW3 snapshots/exports and the immutable terms contain no historic copy

### `packages/db/test/recovery-message-upgrade.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- is absent before the upgrade and applies under the migration role without touching existing records
- keeps the runner idempotent and the previous release path working
- lets a case that existed before the upgrade be previewed over its already-approved pack

### `packages/db/test/extra-origin-upgrade.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- [S8] preserves old columns and fixture origins, adds only NULL columns; migrator idempotent and ordered

### `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- registers 0111, 0112 and the repair by name in increasing order
- applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege
- preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending

### `packages/db/test/recovery-follow-up.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Setup and teardown hooks also NOT RUN.

- is a reviewed act bound to a delivered message, the case revision seen and one practice run, with exactly one persisted owner
- refuses without a delivered message, a stale case revision, a practice run, or twice at once
- is idempotent by command id: the same command replays, a different request with that id conflicts, and a message command id cannot be reused
- DW1: passing the due time gives Review reminder with no new simulated message, and the sink is untouched
- Q1: the due Decision is written by the same transaction as SBOX-2's own advance of the run's fake clock
- Q1: when the due evaluation fails, SBOX-2's advance rolls back with it, and the same follow-up then becomes due normally
- leaves SBOX-2 exactly as it was for a run that has no follow-up
- refuses to schedule on a clock with no time left, and an archived run can no longer be advanced
- DW2: advancing any amount of fake time creates no approval, authorization, outbox action, message or sink row
- DW2: the reminder opens through the M4-5-S message path and is only a preview: nothing is authorized or sent
- DW2: only the exact reminder is approved; any changed body, recipient, amount, pack or hash is refused as changed and approves nothing
- DW2: an older preview cannot be approved once a newer one exists; only the newest exact reminder can be
- DW2: the exact approval resolves the follow-up's own due Decision and queues one action; delivery records exactly one sink row
- keeps M4-5-S's one-effect rule everywhere else: no preview before the due time, none while a reminder is queued, none after it is delivered
- DW3: repeated and racing advances leave exactly one due Decision and one owner, with no duplicate transition, journal or send
- DW3: duplicated due signals, from several connections and a restarted process, create the one due Decision once
- DW3: a signal for another tenant's, or a missing, run does nothing and discloses nothing
- DW3: an advance command replays its first result; the same id for another request, or from another command family, is a conflict
- DW4: a cancellation is recorded once, shows Stopped, and a later advance creates no due Decision
- DW4: a stale cancel is refused
- DW4: %s shows Stopped, and a later advance creates no due Decision
- DW4: a case fact after the reminder is due also shows Stopped, and nothing more can be previewed or approved
- DW4: an archived practice run stops its follow-up
- DW5: revoking the approval behind a pending reminder shows Approval needed again, blocks execution and writes no sink row
- DW5: a fresh reviewed reminder after a revocation needs its own approval, makes its own Decision, and sends exactly once
- DW5: a reminder cannot be cancelled away while its approval stands
- DW5: a reminder queued for delivery is never recorded as delivered once its practice run has been archived
- DW6: the old follow-up stays stopped and is never reused; nothing is created until a new reviewed follow-up exists
- DW6: a landing reversed after a close also reopens the case, and still revives nothing
- every table is tenant-owned with a non-null tenant id, forced row security, migration ownership and runtime SELECT/INSERT only
- denies the runtime role any UPDATE, DELETE or TRUNCATE, so history and the cancellation are append-only
- shows nothing and accepts nothing without a tenant context, and nothing to another tenant
- refuses an actor who is not an active owner
- ties every row to its own tenant, job and case by composite foreign keys: a same-tenant wrong job or wrong case cannot be linked
- is synthetic only: a production or pilot environment is refused by the database, and the contract carries no mode at all
- has exactly one persisted owner per follow-up, which must be the intent's own run, and no intent exists without its owner and scheduled event
- refuses a hand-made follow-up that is not on the case's delivered message, the case as reviewed, or its own session's active run
- refuses a hand-made due row unless the follow-up's own clock reached its due tick and its Decision is a pending, unauthorized one
- refuses a hand-made reminder link or approval that is not the newest preview of an open, due follow-up
- reads case facts identically in SQL and in followUpCaseFacts for every ending and reopening event, at every review point
- appends an identifier-only audit event for each step, exactly once, in a chain that still verifies
- R1: direct SBOX-2 advance audits the due transition in the Decision/event transaction without a follow-up read
- R1: a failure after the atomic due audit rolls back the clock, Decision, due row, event and audit together
- R1 DW6: delivered message 1 remains the source after reminder 2 is approved, revoked, closed and reopened, through exact reminder 3 delivery
- R1: a later %s attempt still refuses the delivered source in the repository and raw SQL guard
- Round 1 A: cancelling a follow-up with an unapproved reminder permits scheduling from delivered message 1
- Round 1 A: an unapproved reminder survives close and reopen without blocking a fresh run through exact reminder delivery
- Round 1 A: a live follow-up with an unapproved preview retains ALREADY_ACTIVE and its delivered scheduling source
- Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact
- R1 parity: audit entries written by the database hash exactly as audit.ts hashes them

### `packages/db/test/fingerprinted-row-shape.integration.test.ts`

Every listed test: **NOT RUN (sandbox cannot start PostgreSQL)**. Setup and teardown hooks also NOT RUN.

- $table keeps its exact ordered column list
- each serialisation site reads whole rows of exactly the tables expected of it

### `packages/db/test/free-port.test.ts`

Every listed test: **NOT RUN (sandbox cannot bind sockets)**. Setup and teardown hooks also NOT RUN.

- skips a port another process is listening on (other tools sit inside the test port ranges)
- gives up with a clear error when every port in the range is in use

## Self-review

Re-read the whole tracked diff against the issued order and this complete receipt. Deterministic reconstruction removed only the thirteen named closing-line budget insertions, the exact four F5 changes, the appended F8 test, and the two authorized free-port setup repairs/file-local helpers, then matched every original test file byte-for-byte. This confirms every existing assertion, expected value, test name, existing millisecond number, query, lock, teardown and pinned guard list is preserved. F1–F3 change only nine closing lines across six files; F9 only one closing line. Both free-port expectation lines are byte-identical. F8 was appended in the required describe and written before F4/F5.

The lane insertion reverses to the byte-identical base registry; only the ten listed tracked paths and this receipt are present. No src/migration/shared-helper/other-lane/contract-document change. No `.skip`, `.todo`, `.only`, retry wrapper, dependency or secret literal was introduced. Cleanup removed generated build/cache/typecheck output and leaves supplied dependencies intact. No migration or rollback procedure is needed for this test-only diff; reverting the diff reverses the repair.

GitHub integration/sockets, exact-commit AMBER independent Claude verdict and separate acceptance remain outstanding. Existing production/pilot release gates are unchanged. This receipt neither grants nor asserts those approvals.

Builder receipt only — not independently verified, not accepted.
