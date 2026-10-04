# M4-5-S builder receipt — Draft, approve and simulate a factual recovery message

Date: 2026-10-04. Builder: **Claude Sonnet 5.5**. Branch `codex/sandbox/m4-5-s-r2` (see "Branch name"), base `origin/main` `b717020` (M4-2-S-R merged; M4-3-S-R merged as `29826ee`).
**Implementation and test evidence only. Not an independent verdict, not independently verified, not technically accepted.** A different model (GPT-6.1 Sol high) checks this and a Claude Opus reviewer reviews it; the builder reviews and merges nothing.

## What was built

A source-bound, practice-only message for a recovery case, from preview through approval to a simulated delivery:

- **Preview** (`POST /api/recovery-cases/:id/messages`): needs an evidence pack that has a recorded attachment approval for its exact hashes and whose sources still rebuild to those hashes. The text is fixed copy chosen by case type; nothing recorded or typed is interpolated into it. Customer case: `Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.` to `practice-customer@example.invalid`. Supplier correction: supplier wording to `practice-supplier@example.invalid`. Sender `practice-builder@example.invalid`. The preview shows sender, recipient, body, amount, attachment digest and a link to every source version (anchors into the pack explorer) and to the exact attachment download.
- **Approve** (`POST .../messages/:messageId/commands`, `approve`): an exact Decision through the shared `UserCommandDispatcher` (action, recipient, content hash, amount, GBP, policy, case revision, one-hour expiry) plus a durable `action_outbox` row carrying the approved bytes, in one transaction with the audit append. The command carries the recipient, body, amount, pack and hash the user saw; any difference is refused (`Review the changed message before approving`).
- **Advance** (`advance`): claims under the case lock, then the shared `ActionExecutor` drives one closed fake adapter (`fake_recovery_message`: no socket, no credential). Delivery means one row in the practice provider's record (`recovery_message_sink`, unique per message). UI label `Simulated delivery — nothing sent` (`data-testid="pursuit-delivery"`).
- **Unknown outcome**: `Outcome unknown — check needed`. Advancing is refused until `reconcile` asks the practice provider what it recorded (found: delivered; not found: safe single retry). Never a blind resend.
- **Revoke**: withdraws the authorization and cancels the queued action; execution is blocked. Any change to the message, case, claim or evidence after approval blocks execution too (`blocked` event, action cancelled, nothing sent), as does an expired or revoked authorization, a revoked owner, or an authorization revoked outside the command.
- Per-message append-only event history (previewed, approved, started, succeeded, outcome unknown, check requested, reconciled, retryable, blocked, revoked) is also the expected-revision counter: two clients give one effect or a typed stale-revision conflict.

## Files

Core `packages/core/src/recovery-message.ts` (+test). DB `packages/db/migrations/0045_recovery_messages.sql`, `recovery-message-repository.ts`, `recovery-message-adapter.ts`, `migrate.ts`, `index.ts`, `MIGRATIONS.md`. API `apps/api/src/recovery-message.{contracts,errors,application,controller}.ts` (+tests), `app.module.ts`, `workspace/application.ts`, `workspace/index.ts`, `openapi.json`. Web: Next route adapters `apps/web/app/api/recovery-cases/[id]/messages/route.ts` and `.../[messageId]/commands/route.ts`, `ui/recovery-messages.tsx` + css module, one prop and one anchor id in `ui/evidence-packs.tsx`, three lines in `ui/recovery-cases.tsx`. Tests: `packages/db/test/recovery-messages.integration.test.ts`, `recovery-message-upgrade.integration.test.ts`, migration-count and catalog rows in `UIWIRE-12`, `demo-bootstrap`, `tenancy`; `apps/web/e2e/M4-5-S.spec.ts` + `helpers/recovery-sources.ts`.

## Migration 0045 (the number reserved for M4-5-S in BUILD_PLAN §12.2)

Four tables, all append-only (runtime SELECT/INSERT), ENABLE+FORCE RLS, `jobguard_migration`-owned, tenant/job/case-qualified FKs (including the exact pack-hash FK and the attachment-approval FK): `recovery_message` (columns CHECK-bound to the hashed `immutable_content`; hash CHECK-bound to the stored bytes), `recovery_message_approval`, `recovery_message_event`, `recovery_message_sink` (`real_external_actions=0`, unique per message and per action). Five invoker-only functions (no SECURITY DEFINER, no new grant elevation): a case snapshot and guards for preview, approval, event revision continuity and sink. Expand-only: no existing table, grant or policy changes. 0043 and 0044 are intentionally absent until their repairs merge.

## Tests first, and what the first runs showed

- Core: `recovery-message.test.ts` written before the module; first run **11 failed / 8 passed of 19** (the 8 are negative `it.each` cases that pass because the missing function throws, so they are not evidence of anything). After implementation: 21/21.
- DB, API and browser tests were written before the implementation of their layers but not run red against a missing module, because the repository had to exist to compile the file. First real DB run: 28/34 passed; the 6 failures were test-side (a fixture without the opening event, error-code expectations where a BEFORE guard fires ahead of an FK, an array-typed privilege query) and one genuine constraint-name collision in 0045; all fixed in the test or SQL, none by weakening an assertion. Second run: 33/34 (one expectation that coincided with the new base revision). Fixed.
- Not shown red: nothing was mutated to prove tests fail. The guards are exercised by forged raw INSERTs under the real runtime role.

## Invariants touched

AGENTS §5.3 (exact authorization bound to action, hash, recipient, amount, policy, revision; dismissal is not approval; workers recheck authority), §5.4 (atomic command, domain, audit, outbox; outcome_unknown reconciled, never blindly retried; no business lock after the audit append), §5.7 (audit holds identifiers and hashes only: no recipient, body or amount), §5.10 (simulation never becomes a production fact: `synthetic_demo` CHECKs, `.invalid` recipients, application refuses any other mode), §5.1 (RLS/FORCE, tenant-qualified FKs). Money is integer pence formatted by bigint (core) and `to_char` (guard); both are tested against each other at 1p, £2,500.00 and the £10,000,000,000.00 limit. No statutory deadline or threat is invented; embedded instructions in source records cannot reach the text.

## Overlaps and ordering

- Shared registration files touched (one editing owner each, serialize at merge): `apps/api/src/app.module.ts`, `apps/api/src/workspace/application.ts`, `workspace/index.ts`, `apps/api/openapi.json` (regenerated), `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts` (0045 appended after 0042; the 0043/0044 repairs will insert theirs before it), the lane registry, `apps/web/app/ui/recovery-cases.tsx` and `evidence-packs.tsx` (also edited by in-flight M4-1-S-R #103, expect textual conflicts), and the migration-count rows in `UIWIRE-12` and `demo-bootstrap` (44 now; become 46 when 0043/0044 land).
- Does not edit `evidence-pack-repository.ts`, `recovery-case-repository.ts` or `recovery-case.application.ts`. It reads packs and cases only, and re-derives pack validity itself from `loadEvidencePackSources`.
- M4-6-S (next): its follow-up reminder is a new message under a later policy version; the guards branch on `policy_version='practice-factual-message.v1'` and relax by migration 0047.

## Decisions taken (reversible, recorded here)

1. **Branch name `codex/sandbox/m4-5-s-r2`**: a stale, unpushed local branch `codex/sandbox/m4-5-s` (and the old `-v2`) exist with an archived uncommitted copy; they were not reused, reset or deleted. Nothing from them is copied except ideas (case-bound message text, session-free actor pattern).
2. **No per-session case ownership table.** The earlier attempt bound each case to a practice session. Every existing leaf (evidence packs, variations, quote send) authorizes by a valid practice-session cookie plus the verified owner membership and trusts the job/case id; this follows that pattern. Listed as a limitation below.
3. **Delivery does not change the case state** (no `start_pursuit` event). A transition would change the case revision the message hash binds. CH-7 adds the fee-terms guard to the pursuit command later.
4. **One live approval per case.** A new message may be approved only when no earlier one is delivered, queued or unknown; revoked and blocked ones do not count.
5. **Approval expires one hour after the preview was created** (deterministic, so approving the same preview twice is a clean replay).
6. **C7 "open from Jobs"** is met as Ben decided: leave through Jobs, reopen the saved job by a fresh navigation, then read it from a second browser context carrying only the practice cookie.

## Limitations (stated, not hidden)

- Practice principal bridge: any valid practice session can act on any case in the demo tenant, as everywhere else in this codebase. This is not a real-user authentication test.
- The business worker (`apps/api/src/worker.ts`) registers only `fake_capture`; an `fake_recovery_message` action it picked up would find no adapter. As with `fake_quote_delivery`, execution is driven in-process by the app (the synthetic demo runs no worker). Not changed here.
- The browser-visible sink count is the practice provider's own record, so it can read 1 while the message is still `Outcome unknown`; the page says so.
- Hand-built SHA-256 in core (existing) is reused, not re-tested here.

## Commands actually run

Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10 (dylib symlinks hydrated from the package's own script, run from its directory). DB and browser runs inside `heavy-slot m45s`; ports 3000 and 55432 checked free first; shared memory listed before and after.

RESULTS_TABLE_PLACEHOLDER

## Not run, and why

- `pnpm eval` (no prompt, model or extraction change; synthetic eval suite not applicable). The full e2e suite across every spec and `test:regression` were not re-run locally; CI runs them.
- No live provider, spend, real send, production mode or real data. No decision record was approved or changed.
