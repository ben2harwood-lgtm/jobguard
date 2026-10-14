# AUDIT-FIX-DBSRC-11 — builder receipt

Status: **HOLD / STOP — finding 4 cannot be fixed without a migration.** This is a builder's source inspection and run receipt, not an independent verdict or technical acceptance. No fix, migration, grant, production code change, existing test change, push or commit was made.

Issued 13 October 2026 by dispatcher 4; executed 14 October 2026. Branch: `codex/sandbox/audit-fix-dbsrc-11`. Starting HEAD and issued base: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-11.md`. Read AGENTS.md and BUILD_PLAN.md §2.4, §5.4 and M4-8-S. Check lane is **RED** for money and tenancy. Node `v24.17.0`; installed pnpm `10.28.1`; dependencies were not installed or downloaded.

## Blocking findings

- Finding 1: **DROPPED — not reproduced with a failing test in this run.**
- Finding 2: **DROPPED — not reproduced with a failing test in this run.**
- Finding 3: **DROPPED — not reproduced with a failing test in this run.**
- Finding 4: **REPRODUCED at source level; STOP for required migration.** A temporary failing test named `allocates integral case money across penny-valued invoice lines` exercises the unchanged repository's `lineFacts` method with synthetic query-result doubles. It expects the integral £384 allocation to succeed. It fails with the expected `FRACTIONAL_CASE_SPLIT`, from `packages/db/src/recovery-allocation-repository.ts:337`. This is not a real-PostgreSQL integration test and does not establish successful review, authorization, execution, persistence or isolation.

The stop follows the issued instruction: “No migration unless the finding cannot be fixed without one (then STOP and say so).” The immutable line source in `packages/db/migrations/0136_recovery_allocation.sql:18–19` stores `net_pence` and `gross_pence` as bigint. The checked execution routine at lines 236–239 requires `binding.grossPence * invoice.net_pence = line.net_pence * invoice.total_pence` and persists gross as bigint. With net 16,001p and invoice totals 32,000p/38,400p, the equation requires gross 96,006/5p; the other line requires 95,994/5p. Neither has an integer solution. Rounding in TypeScript fails the unchanged database equality and would contradict M4-8-S's “No receipt's deemed net is rounded.” An end-to-end fix therefore requires a reviewed migration to the source representation and its checked execution routine, plus corresponding domain/artifact contracts. No such change was attempted.

## Failing reproduction

Temporary test: `/private/tmp/jg-dbsrc11-repro.mts`; output: `/private/tmp/jg-dbsrc11-repro.log`. Command from repository root:

```sh
node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test /private/tmp/jg-dbsrc11-repro.mts
```

Observed: 1 test, 0 pass, 1 fail; `assert.doesNotReject` reports unwanted rejection with actual message `FRACTIONAL_CASE_SPLIT`. A shell wrapper printed the saved output after execution; its exit 0 is not a passing test result. The test remains outside the repository because implementation stopped. Its source is preserved here for a reviewable handoff:

```ts
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecoveryAllocationRepository } from '/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-8-s-r2/packages/db/src/recovery-allocation-repository.ts';

// Source-level reproducer only: query results are synthetic doubles, not PostgreSQL evidence.
test('allocates integral case money across penny-valued invoice lines', async () => {
  const invoiceId = randomUUID(), paymentId = randomUUID(), jobId = randomUUID();
  const rows = [16001, 15999].map(net => ({
    id: randomUUID(), net_pence: String(net), invoice_net_pence: '32000',
    invoice_gross_pence: '38400', existed_at: '2026-10-12T00:00:00.000000Z',
  }));
  const db = { $client: { query: async (sql: string) =>
    sql.includes('SELECT l.*') ? { rows, rowCount: rows.length } : { rows: [], rowCount: 0 } } };
  const repository = new RecoveryAllocationRepository({} as any, 'synthetic_demo');
  await assert.doesNotReject(async () => {
    const facts = await (repository as any).lineFacts(db, { tenantId: randomUUID() }, jobId,
      { id: paymentId, invoice_id: invoiceId, invoice_net_pence: '32000', movement_id: randomUUID(),
        movement_at: '2026-10-13T00:00:00.000Z' },
      { version: 'recovery-allocation-command.v1', action: 'review', commandId: randomUUID(),
        caseId: randomUUID(), paymentId, evidenceId: randomUUID(), expectedCaseRevision: 1, grossPence: 38400 },
      { lines: [] }, null, null);
    assert.equal(facts.lines.length, 2);
  });
});
```

## LATER — receipt only

- Finding 5: workspace reads cast supported money to PostgreSQL integer; add the specified >int32 round-trip regression in later work.
- Finding 6: readiness's wrong-job test supplies a snapshot ID as a plan ID; later use the actual plan and a successful same-job control.
- Finding 7: recovery wrong-job assertions use a nonexistent case; later use an existing foreign-job case and unchanged event/audit counts.
- Report's remaining weak-test suggestions: integral insufficient-cash control for DW3; authorization hash and audit ordering/continuity assertions for DW1.

## Changes, scope and invariants

Only this receipt and one compact additive row in `config/agent-lane-assignments.json` are intended working-tree changes. Registry before: no `audit-fix-dbsrc-11` row. Registry after: one exact branch/receipt entry allowing precisely those two files. All existing registry entries remain unchanged. No premise-establishing setup was added to an existing test; no existing expected value, refusal, count, pinned name, fingerprint or catalogue was changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists were not touched. No protected-line before/after substitution exists to report.

Standard F: **no new or changed GRANT**, no expanded direct application write permissions, no security routine change. No data migration, compatibility impact, external action, provider call, spending, real data, operational alert or product behavior change. No browser workflow was introduced (C1). Independent recorded verdict, separate acceptance and dispatcher-owned commit/push remain pending. Existing release gates and commercial decisions remain unchanged.

## Checks and dispatcher handoff

Actual checks and outcomes are recorded below. Logs live at `/private/tmp/jg-dbsrc11-*.log`. All pnpm checks use the already installed pinned binary via `/private/tmp/jg-dbsrc11-bin` and `LANE_BASE_REF=origin/main`; no dependency installation is performed. Initial system `pnpm --version` unexpectedly attempted registry signature verification and failed on network access; the subsequent checks invoke the existing local `@pnpm/macos-arm64/10.28.1` executable directly. No signature/security setting was disabled.

Working-tree verification: `git diff --check` passes. A read-only Python comparison against `git show HEAD:config/agent-lane-assignments.json` verifies all prior entries unchanged and the new allowlist exactly matches both changed paths. The protected context-boundary file is byte-identical to HEAD; SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. This is a deterministic check, not a model verdict or committed lane-floor run.

| Executed check | Observed result |
| --- | --- |
| Source-level finding 4 reproduction | Expected FAIL: `FRACTIONAL_CASE_SPLIT`; 0/1 tests pass. No fix attempted. |
| `pnpm typecheck` | PASS: 7 successful tasks; 4 Turbo cache replays, fresh DB/API/web checks. |
| `pnpm exec turbo run lint` | PASS: 7 successful package lint tasks; 4 Turbo cache replays, fresh DB/API/web checks. Root lane refusal remains separately recorded. |
| `pnpm build` | PASS: 7 successful tasks; 4 Turbo cache replays, fresh DB/API/web builds. Next.js compiled, validated types and generated 31 static pages. Existing workspace-root/CSS warnings and Turbo sandbox I/O warnings remain; no build failure. |
| `pnpm lint` | FAIL at lane boundary before package lint; `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main, and this handoff must remain uncommitted. |
| `pnpm lint:lanes` | Same fail-closed self-comparison refusal. No lane checker or base override weakened. |
| Core purity (from root lint), `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | PASS. |
| `pnpm exec turbo run test --filter='!@jobguard/db' --filter='!@jobguard/api'` | FAIL: core runs both existing source tests and generated dist tests; core summary 4,878 pass / 12 fail. Failures include compiled tests seeking adjacent `.ts` sources and existing 5-second timeouts. Some other package results are Turbo cache replays, not fresh execution. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | FAIL: 2,440 pass / 5 fail, 78 passing files / 3 failing files. Source-only serial retry removes the compiled-test failures; unchanged five-second limits still fail in receipt-allocation (3), enterprise-domain/boundaries (1), and extra-origin (1). No expectations/timeouts changed. |
| `pnpm --filter @jobguard/db exec vitest run src` | FAIL: 86 pass / 1 fail; existing audit-checkpoint-handoff `[C-OPS-1]` test times out at unchanged 5 seconds. No PostgreSQL integration suite started. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/shadow-isolation.application.test.ts'` | FAIL: 1,339 pass / 218 fail / 1 skip; socket-dependent test files deliberately excluded from this sandbox command. Failures include stale built DB exports (`SiteVisitRepository` missing), existing test doubles, and unchanged 5-second timeouts including protected context-boundary line 1287. No test source/timeout/assertion changed. |
| `pnpm openapi:check` | FAIL: tsx CLI cannot bind its IPC socket (`listen EPERM`). |
| Direct loader OpenAPI check before DB build finished | FAIL: stale built DB lacked `SiteVisitRepository`; no published schema changed. |
| After DB build: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` from apps/api | PASS (exit 0). Same source generator and `--check`, avoiding tsx CLI IPC; normal root command remains a dispatcher check. |

Dispatcher must run on the Mac or GitHub CI: root `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, normal `pnpm openapi:check`, root lint and lane lint after committing, and affected quote/recovery browser regressions in both `mobile-360` and `desktop`. PostgreSQL and browser suites were not started in this sandbox. A subsequent implementation task must obtain migration authorization and write real-PostgreSQL reproductions before changing the allocator.

Focused dispatcher commands (in addition to the mandatory root suites):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/quote.integration.test.ts test/recovery-allocation.integration.test.ts test/recovery-line-allocation.integration.test.ts test/recovery-allocation-races.integration.test.ts test/recovery-allocation-upgrade.integration.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop quote-editor.spec.ts quote-acceptance.spec.ts quote-send.spec.ts M4-8-S.spec.ts
```

Intended conventional commit message is in `/private/tmp/jg-msg-audit-fix-dbsrc-11.txt`; dispatcher owns whether to commit this HOLD handoff. The task is not fixed or technically accepted.
