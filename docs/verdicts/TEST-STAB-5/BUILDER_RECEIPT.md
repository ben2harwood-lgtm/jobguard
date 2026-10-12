# TEST-STAB-5 builder receipt

Builder receipt only — not independently verified, not accepted.

Issued 11 October 2026. Branch: `codex/sandbox/test-stab-5`; inspected clean base `origin/main` = `bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27`. Working-tree changes only; the dispatcher commits.

## Scope

49 database test/harness files now await the existing freePort helper, preserving each original base and span. One lane line added first, in name order, with exactly these file paths. No assertions, expected values, names, timeouts, PostgreSQL settings, product code, migrations, helper implementation, source-pinned authentication files, or dependencies changed. No web workflow introduced (C1). No new operational alerts or data migration; no product backwards-compatibility impact. The only shared file is the lane registry, owned by this leaf for its single line.

Read AGENTS.md and BUILD_PLAN.md §§2.1–2.4. FIX-LATER.md is absent in this checkout; the work order supplies the repair and source context. Dependencies were already installed; no install/download command was run. Node v24.17.0; checks use cached pnpm 10.28.1 through a temporary PATH wrapper (also used by child pnpm commands). The default pnpm version probes emitted a newer-version warning and failed automatic registry-signature verification (fetch failed), so the cached pinned CLI was selected directly without changing configuration or installing packages. This is not evidence of a clean reinstall.

## Candidates left unchanged

- `packages/db/test/demo-bootstrap.integration.test.ts`: Top-level ownerUrl and runtimeUrl immediately interpolate port; moving only the port computation into beforeAll would leave those URLs with an unset port. Moving/changing the URL variables would exceed the permitted computation-only change.
- `packages/db/test/pool-test-utils.ts`: Explicitly excluded; existing freePort implementation, not an EmbeddedPostgres test.

Candidate list built with `git grep -l "Math.random()" -- 'packages/db/test/*.ts' 'apps/*/src/**/*.test.ts' 'apps/*/test/**/*.ts'`. There were 51 candidates including the excluded helper: 50 EmbeddedPostgres files and the helper. No matching application tests constructed EmbeddedPostgres. After the edits, only the two candidates above still contain Math.random(). No other candidate was left unchanged.

## Changed files and per-file proof

Each block is the actual output of `git diff --stat origin/main -- <file>`; each following line records before/after base and span. This list also identifies every changed test file.

`packages/db/test/UIWIRE-10.integration.test.ts`

```text
 packages/db/test/UIWIRE-10.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57900` / `100`; after: `57900` / `100` (identical).

`packages/db/test/UIWIRE-11.integration.test.ts`

```text
 packages/db/test/UIWIRE-11.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58000` / `100`; after: `58000` / `100` (identical).

`packages/db/test/activation.integration.test.ts`

```text
 packages/db/test/activation.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57000` / `200`; after: `57000` / `200` (identical).

`packages/db/test/audit.integration.test.ts`

```text
 packages/db/test/audit.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56000` / `500`; after: `56000` / `500` (identical).

`packages/db/test/capture.integration.test.ts`

```text
 packages/db/test/capture.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56000` / `500`; after: `56000` / `500` (identical).

`packages/db/test/commands.integration.test.ts`

```text
 packages/db/test/commands.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57000` / `500`; after: `57000` / `500` (identical).

`packages/db/test/commercial-integrity.integration.test.ts`

```text
 packages/db/test/commercial-integrity.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58100` / `100`; after: `58100` / `100` (identical).

`packages/db/test/contractor-parties.integration.test.ts`

```text
 packages/db/test/contractor-parties.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58500` / `300`; after: `58500` / `300` (identical).

`packages/db/test/contractor.integration.test.ts`

```text
 packages/db/test/contractor.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58000` / `500`; after: `58000` / `500` (identical).

`packages/db/test/decision-inbox.integration.test.ts`

```text
 packages/db/test/decision-inbox.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56000` / `500`; after: `56000` / `500` (identical).

`packages/db/test/enterprise-identity.integration.test.ts`

```text
 packages/db/test/enterprise-identity.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59000` / `500`; after: `59000` / `500` (identical).

`packages/db/test/evidence-pack-sources.integration.test.ts`

```text
 packages/db/test/evidence-pack-sources.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58750` / `100`; after: `58750` / `100` (identical).

`packages/db/test/evidence-pack-upgrade.integration.test.ts`

```text
 packages/db/test/evidence-pack-upgrade.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60600` / `200`; after: `60600` / `200` (identical).

`packages/db/test/evidence-packs.integration.test.ts`

```text
 packages/db/test/evidence-packs.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60300` / `200`; after: `60300` / `200` (identical).

`packages/db/test/evidence.integration.test.ts`

```text
 packages/db/test/evidence.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56500` / `300`; after: `56500` / `300` (identical).

`packages/db/test/final-account.integration.test.ts`

```text
 packages/db/test/final-account.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57800` / `100`; after: `57800` / `100` (identical).

`packages/db/test/identity.integration.test.ts`

```text
 packages/db/test/identity.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57000` / `500`; after: `57000` / `500` (identical).

`packages/db/test/inbox-relevance.integration.test.ts`

```text
 packages/db/test/inbox-relevance.integration.test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Base/span before: `59600` / `100`; after: `59600` / `100` (identical).

`packages/db/test/job-import.integration.test.ts`

```text
 packages/db/test/job-import.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57200` / `200`; after: `57200` / `200` (identical).

`packages/db/test/job-parties.integration.test.ts`

```text
 packages/db/test/job-parties.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `58000` / `300`; after: `58000` / `300` (identical).

`packages/db/test/job.integration.test.ts`

```text
 packages/db/test/job.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56000` / `500`; after: `56000` / `500` (identical).

`packages/db/test/ledger.integration.test.ts`

```text
 packages/db/test/ledger.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56500` / `300`; after: `56500` / `300` (identical).

`packages/db/test/match-inbox-replay.integration.test.ts`

```text
 packages/db/test/match-inbox-replay.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60400` / `99`; after: `60400` / `99` (identical).

`packages/db/test/materials.integration.test.ts`

```text
 packages/db/test/materials.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59900` / `50`; after: `59900` / `50` (identical).

`packages/db/test/outbox.integration.test.ts`

```text
 packages/db/test/outbox.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57500` / `400`; after: `57500` / `400` (identical).

`packages/db/test/practice-feed.integration.test.ts`

```text
 packages/db/test/practice-feed.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60300` / `200`; after: `60300` / `200` (identical).

`packages/db/test/practice-scope.integration.test.ts`

```text
 packages/db/test/practice-scope.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59000` / `300`; after: `59000` / `300` (identical).

`packages/db/test/practice-session.integration.test.ts`

```text
 packages/db/test/practice-session.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57000` / `500`; after: `57000` / `500` (identical).

`packages/db/test/prevention-checks.integration.test.ts`

```text
 packages/db/test/prevention-checks.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59700` / `100`; after: `59700` / `100` (identical).

`packages/db/test/quote.integration.test.ts`

```text
 packages/db/test/quote.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56800` / `200`; after: `56800` / `200` (identical).

`packages/db/test/readiness.integration.test.ts`

```text
 packages/db/test/readiness.integration.test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Base/span before: `59500` / `100`; after: `59500` / `100` (identical).

`packages/db/test/recovery-cases.integration.test.ts`

```text
 packages/db/test/recovery-cases.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60000` / `200`; after: `60000` / `200` (identical).

`packages/db/test/recovery-cases.workbench.integration.test.ts`

```text
 packages/db/test/recovery-cases.workbench.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60000` / `200`; after: `60000` / `200` (identical).

`packages/db/test/recovery-follow-up-upgrade.integration.test.ts`

```text
 packages/db/test/recovery-follow-up-upgrade.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `61400` / `200`; after: `61400` / `200` (identical).

`packages/db/test/recovery-message-upgrade.integration.test.ts`

```text
 packages/db/test/recovery-message-upgrade.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `61200` / `200`; after: `61200` / `200` (identical).

`packages/db/test/recovery-messages.integration.test.ts`

```text
 packages/db/test/recovery-messages.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60900` / `200`; after: `60900` / `200` (identical).

`packages/db/test/recovery.integration.test.ts`

```text
 packages/db/test/recovery.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57600` / `100`; after: `57600` / `100` (identical).

`packages/db/test/review.integration.test.ts`

```text
 packages/db/test/review.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `56500` / `300`; after: `56500` / `300` (identical).

`packages/db/test/sandbox.integration.test.ts`

```text
 packages/db/test/sandbox.integration.test.ts | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)
```

Base/span before: `57500` / `100`; after: `57500` / `100` (identical).

`packages/db/test/shared-money-origin.integration.test.ts`

```text
 packages/db/test/shared-money-origin.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59600` / `100`; after: `59600` / `100` (identical).

`packages/db/test/supplier-documents.integration.test.ts`

```text
 packages/db/test/supplier-documents.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59950` / `40`; after: `59950` / `40` (identical).

`packages/db/test/supplier-matching.integration.test.ts`

```text
 packages/db/test/supplier-matching.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60000` / `40`; after: `60000` / `40` (identical).

`packages/db/test/tenancy.integration.test.ts`

```text
 packages/db/test/tenancy.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `55432` / `500`; after: `55432` / `500` (identical).

`packages/db/test/things-replay.integration.test.ts`

```text
 packages/db/test/things-replay.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60900` / `90`; after: `60900` / `90` (identical).

`packages/db/test/variation.integration.test.ts`

```text
 packages/db/test/variation.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `57400` / `100`; after: `57400` / `100` (identical).

`packages/db/test/watchdog-command-harness.ts`

```text
 packages/db/test/watchdog-command-harness.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `portBase` / `400`; after: `portBase` / `400` (identical).

`packages/db/test/watchdog-migration-owner.integration.test.ts`

```text
 packages/db/test/watchdog-migration-owner.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60500` / `400`; after: `60500` / `400` (identical).

`packages/db/test/watchdog.integration.test.ts`

```text
 packages/db/test/watchdog.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `60400` / `100`; after: `60400` / `100` (identical).

`packages/db/test/workspace-read.integration.test.ts`

```text
 packages/db/test/workspace-read.integration.test.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Base/span before: `59800` / `100`; after: `59800` / `100` (identical).

The harness preserves its caller-supplied `portBase` and span 400 without changing any callers. Most files have 4 changed lines; inbox-relevance and readiness have 2 because setup/imports share a compact line. Sandbox has 6 because its top-level port computation must move into async beforeAll: port becomes a typed let, and the password remains the same const. No other computation moves.

## NOT RUN

Every changed test/harness file below is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. The harness is exercised by its existing importing integration tests in CI. GitHub CI must run the applicable suites after the dispatcher commits and pushes.

- `packages/db/test/UIWIRE-10.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/UIWIRE-11.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/activation.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/audit.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/capture.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/commands.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/commercial-integrity.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/contractor-parties.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/contractor.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/decision-inbox.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/enterprise-identity.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/evidence-pack-sources.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/evidence-pack-upgrade.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/evidence-packs.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/evidence.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/final-account.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/identity.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/inbox-relevance.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/job-import.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/job-parties.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/job.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/ledger.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/match-inbox-replay.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/materials.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/outbox.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/practice-feed.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/practice-scope.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/practice-session.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/prevention-checks.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/quote.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/readiness.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery-cases.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery-cases.workbench.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery-follow-up-upgrade.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery-message-upgrade.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery-messages.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/recovery.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/review.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/sandbox.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/shared-money-origin.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/supplier-documents.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/supplier-matching.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/tenancy.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/things-replay.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/variation.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/watchdog-command-harness.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/watchdog-migration-owner.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/watchdog.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).
- `packages/db/test/workspace-read.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).

All remaining PostgreSQL suites, including the skipped bootstrap test, `pnpm test:db`, `pnpm test:migrations`, and PostgreSQL/MinIO integration checks — NOT RUN (sandbox cannot start PostgreSQL / a browser). All Playwright specs / `pnpm test:e2e` — NOT RUN (sandbox cannot start PostgreSQL / a browser). No root or whole-package test suite was run. No changed pure unit-test file exists; the work order limits test runs to changed files, all of which require PostgreSQL or are its harness. No model/prompt/schema changes; evaluation is inapplicable.

## Commands and results

Commands below used `PATH="/private/tmp/jg-test-stab-5-bin:$PATH"` to select the already cached pnpm 10.28.1. No repository scripts or checks were modified.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --version` (initial default CLI) | 1 | Automatic registry-signature verification failed because fetch failed; no package install was requested. |
| `npm_config_manage_package_manager_versions=false npm_config_package_manager_strict_version=false pnpm --version` (initial default CLI diagnostic) | 1 | Same failed automatic verification; cached pinned CLI used for all actual checks. |
| `pnpm --version` (cached pinned CLI) | 0 | 10.28.1 |
| `pnpm build` | 0 | 7 successful / 7 total; 51.393s. Sandbox cache-write warnings, existing Next workspace-root and CSS warnings; build completed. |
| `pnpm typecheck` (one invocation) | 0 | 7 successful / 7 total, 4 cached; 30.117s. |
| `LANE_BASE_REF=origin/main pnpm lint` (one invocation) | 1 | Core purity passed; lane guard rejected self-comparison before remaining lint steps could run. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same lane self-comparison rejection. |
| `pnpm openapi:check` | 1 | tsx launcher attempted Unix-socket IPC; sandbox returned listen EPERM before checker ran. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/checker completed through Node loader, avoiding launcher IPC; no schema rewrite. |
| `git diff origin/main --check` | 0 | No whitespace errors. |
| Optional Python character-diff inspection | 130 | Interrupted the slow difflib diagnostic; completed full word-diff inspection and exact byte-restoration instead. No files changed by this inspection. |
| `git diff origin/main --word-diff=porcelain` (all changed test tokens inspected) | 0 | Every changed file inspected, including the sandbox declaration/assignment move. |
| Deterministic Python byte-restoration and range/allowlist comparison | 0 | Every test restores exactly to origin/main after undoing only the authorized edits; both unchanged candidates match the base; all base/span pairs match; lane is exactly one extra line with exact paths. This is a deterministic check, not an independent model review or runtime test. |

Lint and lane stderr:

```text
Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.
```

`HEAD` equals `origin/main` because the branch was cut from that base and .git is read-only: this builder must leave changes uncommitted. The unchanged guard checks base != HEAD before including working-tree changes. Neither lint nor lane checking passed; the dispatcher must commit and rerun the prescribed commands against origin/main. The deterministic scope comparison above does not substitute for that required check.

## Aggregate diff proof

Actual `git diff origin/main --stat | tail -1` output (exit 0):

```text
 50 files changed, 98 insertions(+), 97 deletions(-)
```

This is the tracked working-tree total: 49 test/harness files plus the lane registry. The new untracked builder receipt is also part of the handoff but is absent from git diff until the dispatcher stages/commits it. Additional changed file: `config/agent-lane-assignments.json`; additional new file: `docs/verdicts/TEST-STAB-5/BUILDER_RECEIPT.md`. Intended message is outside the repository at `/private/tmp/jg-msg-test-stab-5.txt`.

Lane registry stat (actual command, exit 0):

```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```

## Requested diff-line filter

```sh
git diff origin/main -U0 -- packages/db/test apps | grep -E '^[-+]' | grep -v -E '^(\+\+\+|---)' | grep -v -E 'freePort|pool-test-utils|Math\.random|const port|let port|port ?='
```

Actual exit: 0. Actual stdout:

```text
-beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"sandbox-pg-"));pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password});await admin.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);await admin.query(`CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner`);process.env.JOBGUARD_ENV="synthetic_demo";await bootstrapSyntheticDemo({ownerUrl:`postgresql://neondb_owner:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`,runtimeUrl:`postgresql://jobguard_runtime:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`});runtime=new Pool({connectionString:`postgresql://jobguard_runtime:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`});repo=new SandboxRepository(runtime)},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
```

The filter emits one removed line, the original compact `beforeAll` line in `sandbox.integration.test.ts`. The requested top-level-to-async move inserts `port=await freePort(57500,100);` at its opening, so the old line is removed and does not itself contain any of the allowed filter strings. Its replacement is excluded by freePort. The entire old line is otherwise byte-for-byte retained in its replacement after that sole insertion. This is the permitted setup move, not an assertion or other setup change; the byte-restoration check independently of this line filter confirms that. The filter therefore is not empty; the one emitted line and the 6-line stat exception are explicitly reported.

## Self-review

Re-read the complete tracked diff against this work order using the full origin/main diff, per-file before/after expressions/imports and word diff; checked the receipt separately because it is untracked. Checked every file, exact base/span, import path/extension/style, async placement, excluded paths and the one-line lane insertion. Reviewed the sandbox move and its filter exception. Found the bootstrap top-level URLs depend immediately on port: left that candidate unchanged and removed it from the lane allowlist before changing any test.

The deterministic byte-restoration check covers complete files: removing only the added import name, restoring each original random expression, and undoing the sandbox port declaration/assignment move yields the exact original bytes in all 49 files. Assertions, expected values, timeouts, names, database settings and every unrelated variable are preserved. The existing helper probes availability at selection time; this change adds no port reservation mechanism. No test or browser result is claimed. No .git writes, commits, pushes, migrations, dependency changes, product edits or helper changes were performed.

## Remaining gates and handoff

Dispatcher owns the commit and push. GitHub CI must execute all database/browser regressions and rerun lint/lanes after committing; this builder has no database runtime proof. The issued mechanical floor is RED; a fresh Claude Opus review and separate Sol check must confirm each file against the exact dispatcher commit, followed by separate acceptance. This receipt is not either review and records no technical acceptance. No production/release authorization is supplied.

Builder receipt only — not independently verified, not accepted.
