# M4-5-S builder receipt — round 4, 7 October 2026

Repair of PR #106 on `codex/sandbox/m4-5-s-r2`, this worktree. Starting head: `58da8bee2467c3047726a3bfdcbcaa62b60491cc`; available `origin/main`: `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`. All changes in this round are uncommitted working-tree changes for the dispatcher. Earlier work is preserved. No commit, staging, checkout, fetch, push, merge, PR creation/update, dependency install, live provider, real send, spending, production activation or policy approval was performed. Synthetic fixtures only.

**Status: builder repair supplied; HOLD for missing CI/dependency evidence and the reverse evidence-pack ownership repair. This is not an independent verdict or technical acceptance.** A different model must record a verdict against the exact dispatcher-created commit, and a separate actor must accept it. Ben retains push/merge/release authority (C8).

## Ben's recorded decision and replay contract

Ben's Command Center decision, **7 October 2026: “current state.”** An identical recovery-message command ID and payload returns the **current case/message state**, not a stored first-response snapshot. This covers preview, approve, advance, revoke (the cancellation action), and reconcile. The response's `messages` retains the addressed message's history; `latest` can identify a subsequent replacement. Replays still require current access, do not duplicate authorization or delivery, and different payload/action/actor/case/message reuse conflicts. This ruling resolves Sol finding 7; it does not grant any commercial-policy approval.

Documented in the lane-owned `apps/api/src/recovery-message.contracts.ts`, both relevant controller operation descriptions, and generated `apps/api/openapi.json`. The Next `/api/recovery-cases/:id/messages` and `.../:messageId/commands` adapters expose the same service contract. No response schema or persisted artifact was changed to store an original response.

Real-PostgreSQL regressions replay preview after approval and delivery; approval after delivery; an earlier failed advance after a later successful advance; unknown advance and reconciliation after later delivery; and revoke after replacement preview/approval. They compare the complete current projection, retain the same command IDs, reject different valid payloads under each ID, and assert sink/attempt counts.

## Changes since the round-3 packet

The round-3 receipt is historical evidence and is unchanged. This receipt includes the subsequent **408e25b … 58da8be** work:

- `408e25b`: execution-result history uses `system:recovery-message-executor`, retaining the approving membership as an authorization reference, rather than impersonating the human actor. Recovery commands register shared receipts tenant-wide; different-payload IDs conflict. Existing actor/receipt tests remain.
- `f32cf5d`: main `a5ed99a` was merged previously, bringing SH-1 and migration 0053. This round did not perform that merge or copy shared work.
- `a6c02e3`: receipt acquisition precedes the case lock, avoiding the shared-dispatcher/recovery lock inversion; the existing race regression remains.
- `e940afe`: the browser spec inlines the established synthetic demo tenant ID instead of importing the ESM-only DB package.
- `58da8be`: a direct-executor retryable changed-source refusal becomes cancelled/blocked on read, releasing replacement previews. This round extends that behavior to terminal refusals.

This round adds the following repairs, without changing shared worker, session or dependency code:

1. **Sol finding 3, terminal refusal half:** `finishHistory()` now normalises both `retryable` and `dead_letter` when the **latest attempt** has `FAKE_BLOCKED_CHANGED`. It preserves unrelated failure/unknown outcomes, cancels the action, and records blocked history through existing guards/audit. The advance-result cancellation predicate also recognises terminal refusal. A real PostgreSQL regression makes four genuine definite failures, amends the case, drives the fifth attempt through the real executor/fake adapter, requires the valid `failed` attempt outcome, and verifies cancelled/blocked history, zero sink effects and a replacement preview. It intentionally depends on OUTBOX-ADAPTER-1's fifth-attempt fix.
2. **Sol finding 4, recovery half:** recovery commands take the **real evidence-pack command advisory lock** and check both pack generation and attachment-approval command tables inside the transaction that registers the recovery receipt/effect. Approval repeats this check inside its dispatcher transaction; its preliminary check alone is insufficient. Order: recovery command identity → owner → shared receipt → pack command identity → case → business rows → audit. No business lock is acquired after audit. Sequential PostgreSQL tests use actual `EvidencePackRepository` generation/approval IDs against every recovery action. Concurrent tests use actual pack and recovery services on different cases, observe PostgreSQL locks to make the pack command commit first, and require preview/approval to conflict with no recovery effect. Existing generic-receipt and lock-order tests are retained.
3. **Sol finding 5:** the supplier recovery picker offers an explicit recorded, job-scoped delivery selection. The existing generated `materials-B-delivery` is a **partial** delivery: 10 each delivered, 8 accepted, against this practice job's 40-unit order. The UI labels those facts; it does not claim 40 units arrived or infer a source from equal amounts. Opening the supplier case re-fetches and validates the selected ready delivery, then includes its immutable document identity beside the rate revision and invoice version. No selection preserves the earlier incomplete-pack journey, including M4-3-S's exclusion assertions. The existing supplier browser test now imports generated invoice/delivery through the visible document picker, selects delivery and opens the case through the visible recovery picker, builds/approves attachment, previews/approves the message, simulates unknown delivery and reconciles. It asserts the real PostgreSQL goods-receipt → order → job association, exact case refs, focus/touch size, saved state and source identities. It contains no HTTP case-opening or intake bypass. Existing money, wording, one-sink, unknown-outcome and persistence assertions remain. The selector's scoped CSS bounds its width for mobile.
4. **Sol finding 7:** current-state replay contract and regression coverage, as above.
5. **Sol finding 8:** this current receipt. **The integrator must update PR #106's description** to the actual new commit, current checks, dependency holds, renumbering and this receipt. The stale `5c9acb0`/fully-green claim must not remain. No PR write was authorized or performed here.

## Test-first evidence

Before any implementation or migration changes, tests were added to the existing lane-owned service/UI test files and executed against the unchanged **58da8be implementation**:

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts` | 1 | 5 existing tests passed; **3 new regressions failed**: terminal refusal remained `dead_letter`, and both pack-command ownership cases resolved instead of conflicting |
| `pnpm --filter @jobguard/web exec vitest run app/ui/recovery-messages.test.tsx` | 1 | 4 existing tests passed; **1 new regression failed** because the delivery selector was absent |
| Same DB command after repair | 0 | **8 passed** |
| Same UI command after repair | 0 | **5 passed** |

Logs: `/private/tmp/m45-round4-{red,green}-{db,web}-unit.log`. These are orchestration/storage-double and static-render tests, **not PostgreSQL or browser execution evidence**. The PostgreSQL and revised browser regressions were written before their implementation changes but **were not run red or green locally**: the dispatcher states this sandbox cannot bind localhost/start PostgreSQL. They run in GitHub CI after the dispatcher pushes. No test assertion was weakened/deleted, no skip/retry was added, and no timeout was introduced or lengthened.

## Migration and lane

Ben's **5 October merge-ahead ruling**, card `jobguard-merge-ahead-of-103-2026-10-05`, and the integrator's 7 October assignment move `0045_recovery_messages.sql` to **0099_recovery_messages.sql**. Migration 0053 already merged; 0054–0093 remain reserved, 0094 is SBOX-SESSION-1, 0095 CH-3a, 0096 CH-2, 0097 M4-1-S-R and 0098 M0-6L. Lower-numbered PRs merging first must precede this PR, or this migration must be renumbered again.

The renamed SQL is **byte-for-byte identical** to the 58da8be file: SHA-256 `6e43fc86e1bfc600b8bc2ae7c3d00c85485109636f26e714b71895f36535e11d`. It is **last** in `MIGRATION_URLS`. There are still **45 registered migrations**, so count assertions remain unchanged. `MIGRATIONS.md`, bootstrap test wording and all executable filename lookups were updated. The upgrade suite still seeds old cases/approved packs before the new migration and asserts unchanged history, owner/RLS/catalog guarantees and previous-release commands; its “before migration” boundary now includes 0053, the preceding supported schema on this head. Historical receipts keep their original filenames/facts.

The lane replaces the old migration path with 0099, scopes receipt paths to `docs/verdicts/M4-5-S/**`, and adds `BUILD_PLAN.md`. The **only BUILD_PLAN change** is the exact requested ledger-amendment paragraph immediately after “Each repair's specification…”. No other lane is widened or changed.

The SQL remains expand-compatible, with no backfill or runtime grant/owner/RLS changes. This number was reserved/unmerged: no applied migration ledger is rewritten. Forward fix only for already-recorded message/authorization/audit/sink facts; preserve history, cancel eligible pending authority or disable the surface, and use a reviewed forward migration. The shared 19-source locking triggers and four message tables are earlier work, preserved rather than newly added this round.

## Actual verification in this sandbox

Node **24.17.0**, cached pinned pnpm **10.28.1**, supplied dependencies; commands use `PATH=/private/tmp/m45-tools:$PATH` to select that existing pnpm launcher. No clean install or download was performed. Exact final outcomes are recorded below before handoff.

| Command | Exit | Evidence |
|---|---:|---|
| `pnpm typecheck`; final `pnpm typecheck --force` | 0 | Final **7/7 tasks**, no cached results |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane guard rejects the **deleted old 0045 path** in this uncommitted rename, so the root command stops before package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same old-path refusal; **not** a self-comparison refusal and not a claimed pass |
| `pnpm exec turbo run lint --force` | 0 | Separate package checks: **7/7 tasks**, no cached results; does not turn the root lint refusal into a pass |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | 0 | Remaining actual static boundary checks passed, run separately because root lint stopped at the lane check |
| `node --test tools/agent-lane-boundary.test.mjs` | 0 | **23 passed**, no skips |
| `pnpm --filter @jobguard/db exec vitest run src test/recovery-message-repository.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | **15 passed**, service/source/CLI units only |
| `pnpm --filter @jobguard/web test` (final) | 0 | **68 passed** across 9 files |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | **148 passed**, health test and associated unhandled error blocked by `listen EPERM`; no API full-suite pass claimed |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-message.application.test.ts src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts --maxWorkers=1` | 0 | **41 passed** |
| `pnpm --filter @jobguard/core exec vitest run src` | 1 | Extra, unchanged-source regression check: **333 passed, 2 timed out** in SH-1 `extra-origin` and `receipt-allocation` tests |
| Same core suite with `--maxWorkers=1` | 1 | **334 passed, 1 timed out**, unchanged `extra-origin` exhaustive offset test |
| Isolated `src/extra-origin.test.ts src/receipt-allocation.test.ts --maxWorkers=1` | 1 | **37 passed, 3 timed out**: exhaustive offsets, 2000-line allocation, and bounded denominator working size; all existing 5000 ms timeouts were preserved |
| `pnpm exec tsc -p /private/tmp/m45-db-tests-tsconfig.json` (final) | 0 | Supplemental strict compilation of DB message/service/upgrade tests; no DB execution |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-messages.integration.test.ts test/recovery-message-upgrade.integration.test.ts --json` (final) | 0 | **78 message + 3 upgrade tests collected**, not run |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop M4-5-S.spec.ts` | 0 | **10 project cases collected** (5 per project), not run |
| `pnpm build --force` | 0 | **7/7 tasks**, no cached results, including optimized production Next build |
| `node --import tsx src/generate-openapi.ts`, then the same command with `--check` (cwd `apps/api`) | 0 | Generated spec updated and matches; Node loader avoids the tsx CLI's known IPC bind restriction |
| `git diff --check` | 0 | No whitespace errors |

Logs are `/private/tmp/m45-round4-*.log`; DB collection is `/private/tmp/m45-round4-db-collection-final.json`. Supplemental assertions confirmed only the `m4-5-s` lane changed, SQL bytes match, 45 migrations remain with 0099 last, and BUILD_PLAN differs only by the prescribed paragraph.

The lane guard uses `--no-renames` and includes the working-tree deletion against **58da8be**, where 0045 still exists. The required lane replaces that path; retaining it merely to make this local intermediate state green would violate the requested registration. Available `origin/main` has **no 0045 file**. A separately labelled read-only projection of the final tree against that base found no out-of-lane paths (including the authorised rename), but **is not actual `lint:lanes` evidence**. The dispatcher-created commit's real lane checks must still pass in CI. No guard was weakened or bypassed.


No local PostgreSQL, migrations, browser execution, screenshot/trace inspection, clean install, restore, root `pnpm test`, deployment, live evaluation or fail-closed security audit was claimed. No prompt/model/parser policy changed, so `pnpm eval` is inapplicable to this repair. DB/browser collection and strict compilation are distinct from execution.

## Remaining dependencies, follow-up and acceptance gates

- **Sol finding 4, reverse half — OUT OF LANE, NOT WAIVED:** `packages/db/src/evidence-pack-repository.ts` must make generation and attachment approval refuse an ID already registered by recovery commands, atomically, preserving lock order. Required follow-up tests use real services for **recovery-first sequential and concurrent reuse in both generation and attachment directions**, including approval's two-transaction gap. This lane implements pack-first refusal fully; it does **not** claim cross-family exclusion when recovery wins first. No out-of-lane source was edited and no failing/disabled test was added to pretend this half is covered.
- **Sol findings 2 and 3, fifth-attempt outcome/guard half:** **PR #112, OUTBOX-ADAPTER-1**, merges first. `packages/db/src/outbox.ts` and `apps/api/src/worker.ts` were not edited/copied. The valid terminal-attempt/history guard must be integrated through main; 0099's SQL was not changed to copy that fix. Verify actual worker approval remains pending, manual Advance delivers once, and the new fifth-attempt PostgreSQL regression passes after integration.
- **Sol finding 6:** **PR #109, SBOX-SESSION-1**, merges first. No session-binding code was copied. C3 isolation remains a required gate, not waived.
- **Sol finding 1:** the shared security dependency update and a green fail-closed dependency-review on the resulting head remain required. `pnpm-lock.yaml`/shared dependency policy are outside this lane; no advisory was suppressed or audit weakened. Prior supplied Sol evidence reported run **37509926002** had one critical/two high advisories; this is historical supplied evidence, not a CI run executed or fetched here.
- The unchanged SH-1 tests in `packages/core/src/extra-origin.test.ts` and `packages/core/src/receipt-allocation.test.ts` still time out locally, including in the isolated run; the full core suite is not green here. No source/test/timeout change was made outside this lane. CI must establish the earlier regression guarantees on the resulting head.
- After dependency merges, the dispatcher/integrator takes a main merge, checks lower-number ordering, updates the PR body, and runs the full mandatory CI suites. Newly committed/integrated code needs a fresh or explicitly rebound independent verdict and separate acceptance. None is inferred from this builder receipt.

Affected invariants: C1/C2 API/UI composition, C3 synthetic mode and unchanged held session gate, C4 immutable facts/exact integer pence/RLS, C5 current-state replay and ID/authorization races, C6 real PostgreSQL/browser regressions, C7 picker accessibility/persistence, C8 truthful gate evidence. AGENTS §§5.1, 5.3, 5.4, 5.7, 5.8 and 5.10 remain applicable. No business-policy, provider destination, environment variable, financial derivation, privileged grant or external alert was introduced.

**Intended commit message:** `/private/tmp/jg-msg-m4-5-s-fresh.txt`. The dispatcher creates the commit; this receipt cannot bind an independent verdict to an uncreated SHA. **Not independently verified; not accepted.**
