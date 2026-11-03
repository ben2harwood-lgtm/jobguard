# LP-5c PR #540 test repair evidence

Builder test evidence; not an independent review or permission to merge.
Base head: `87d61aaf5d5692d0ee9177c85b17a75fb5569e51`.
Branch: `codex/sandbox/lp-5c-revoke`.

Migration 0557, routines and product code are unchanged. No test is deleted or skipped.
The checker correction is applied: guard proofs retain their original trigger/constraint/routine errors; only dedicated runtime forgery probes expect permission denial.

“Setup” means owner fixture writes outside the behavior under test. “Guard” means the forged owner write or an owner-staged receipt still reaches the original refusing guard. “Runtime forgery” means the dedicated runtime denial assertion expects 42501.

Every file below is in `packages/db/test/` and ends in `.integration.test.ts`.

| File stem | Classification | Preserved proof / change |
| --- | --- | --- |
| `commands` | Setup + guard | Owner stages dismissed resolution and attempts authorization; original 23514 trigger assertion and invocation counts remain. |
| `extra-origin` | Setup + guard | Owner executes raw origin/receipt fixtures; original kind, actor, uniqueness, deferred audit and tenant-setting refusals remain. |
| `job-parties` | Setup + guard | Owner stages adoption/binding authority and deferred protocol probes; correction routine and runtime INSERT probes explicitly assume the runtime login. |
| `site-visit` | Setup + guard | Owner stages the receipt, then runtime invokes complete-visit; CLOSEOUT_ANSWER_REQUIRED / 23514 and no-change checks remain. |
| `subscription-authority` | Guard (catalogue) | Assert the current migration chain denies runtime receipt INSERT; subscription restrictions remain exact. |
| `success-fee-catch-posting` | Setup + guard | Owner stages generic approvals without an SV-6 command; SUCCESS_FEE_REVIEW_REQUIRED and every effect count remain. |
| `contractor-parties` | Guard + runtime forgery | Original owner-forged succeeded receipt still fails with 23514; runtime fails with 42501. Both preserve the full effect snapshot before the legitimate bind. |
| `enterprise-fee-command-fixtures` | Setup + guard | Owner injects corrupt receipt results; runtime replay still reconstructs the authoritative statement/correction result and all conflict/audit assertions remain. |
| `extra-origin-upgrade` | Setup + guard | Owner writes historical and malformed origins; original column guards, backfill and upgrade catalogue comparisons remain. |
| `extra-unlink` | Guard | Owner constructs the completed raw unlink without its audit; INVALID_ORIGIN / 23514 and the full snapshot equality remain. |
| `job-work-state-commands-boundaries` | Setup + guard | Owner inserts the forged receipt, runtime inserts watchdog identity; JOB_NOT_LIVE and unchanged identity/effect counts remain. |
| `lp-adoption-boundary` | Setup + guard | Owner stages receipt authority in the same transaction as the direct adoption probe; original authorization and JOB_PARTIES_REQUIRED refusals and all tenant counts remain. |
| `watchdog-lock-order` | Setup | Only the observer self-check locks a receipt through an observed owner connection, since FOR UPDATE requires UPDATE privilege. Real command lock-order tests still use runtime. |
| `commercial-integrity-v3-receipt-guard` | Setup + guard + runtime forgery | Owner stages unrelated receipts and proves immutable/conversion triggers and rolled-back trigger-removal control. The separate spoofed-role runtime forgery expects 42501. |
| `extra-approval-chain` | Setup + guard | Owner stages another actor’s receipt, runtime invokes xa_approve; original INVALID_COMMAND routine assertion remains. |
| `extra-links` | Setup + guard | Owner executes raw link/origin/order fixtures; original FK, uniqueness and deferred audit checks remain. Raw-unlink failure injection observes the owner pool actually used. |
| `job-import-v3-admission-upgrade` | Guard (catalogue) | Full-upgrade expectation changes only the command_receipt runtime ACL from ar to r and explicitly denies INSERT; every other ACL, owner, RLS and stored-row comparison remains exact. |
| `job-work-state-sources` | Setup | Owner inserts/completes receipt fixtures; photo, evidence-link and stage writes explicitly assume runtime. Source forgery and hidden-state comparisons remain unchanged. |
| `recovery-follow-up` | Setup + guard | Owner stages the already-resolved Decision; RECOVERY_FOLLOW_UP_DUE_INVALID and the final zero-due check remain. |
| `site-extra-pricing` | Setup + guard | Owner stages origin/receipt fixtures; direct pricing calls explicitly assume runtime. Original authority refusals, exact result, basis and audit assertions remain. |
| `decisions-later` | Setup + guard | Owner stages dismissed resolution and attempts receipt tamper; original mandatory-classification and DECISION_CHECK_IMMUTABLE proofs remain. |
| `lp5-commands` | Guard | Owner attempts completed-receipt tamper plus tenant switch; original AUTHORIZATION_INVALID / 23514 and saved-result equality remain. |
| `lp5c-revoke` | Setup | Synthetic positive job starts accepted so the command reaches receipt/replay checks. Existing runtime 42501 forgeries and all no-change counts remain. |
| `recovery-case-terms` | Setup + guard | Owner constructs hand-made authority; original role, exact authorization, duplicate approval and timestamp routine checks retain their exact errors and counts. |
| `shared-money-origin` | Setup + guard | Owner constructs command origins for invariant probes. Shadow-origin attempts assume runtime after receipt setup, preserving the original identical shadow-refusal errors and non-disclosure checks. |

The lane file `config/lanes/lp-5c-revoke.json` keeps the version-2 `{ "version": 2, "lanes": { ... } }` shape, lists every repair file and this evidence document, and does not list itself.

## Executed checks

- Node 24.15.0, pnpm 10.28.1; core/storage dependency builds passed.
- Real embedded PostgreSQL 16; synthetic fixtures and fake external data only.
- Final complete run: **25 files passed, 606 tests passed, zero failed/skipped**, 403.29 seconds.
- Latest LP-5 command guard rerun: **20 passed**, including both owner-side terminal receipt tamper guards (5.89 seconds).
- `pnpm --filter @jobguard/db typecheck`: passed.
- `node tools/agent-lane-boundary-lint.mjs`: passed against the fetched `origin/main` comparison base.
- `git diff --check`: passed.
- Diff against the requested base contains no changes to migrations, routines or product source. No real product runtime-write defect was found.
- No requested check remains blocked. Full monorepo tests/build/lint/e2e and a new remote CI result were not verified by this repair.

Complete PostgreSQL command (run from the repository root):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --reporter=verbose \
  test/commands.integration.test.ts \
  test/extra-origin.integration.test.ts \
  test/job-parties.integration.test.ts \
  test/site-visit.integration.test.ts \
  test/subscription-authority.integration.test.ts \
  test/success-fee-catch-posting.integration.test.ts \
  test/contractor-parties.integration.test.ts \
  test/enterprise-fee-command-fixtures.integration.test.ts \
  test/extra-origin-upgrade.integration.test.ts \
  test/extra-unlink.integration.test.ts \
  test/job-work-state-commands-boundaries.integration.test.ts \
  test/lp-adoption-boundary.integration.test.ts \
  test/watchdog-lock-order.integration.test.ts \
  test/commercial-integrity-v3-receipt-guard.integration.test.ts \
  test/extra-approval-chain.integration.test.ts \
  test/extra-links.integration.test.ts \
  test/job-import-v3-admission-upgrade.integration.test.ts \
  test/job-work-state-sources.integration.test.ts \
  test/recovery-follow-up.integration.test.ts \
  test/site-extra-pricing.integration.test.ts \
  test/decisions-later.integration.test.ts \
  test/lp5-commands.integration.test.ts \
  test/lp5c-revoke.integration.test.ts \
  test/recovery-case-terms.integration.test.ts \
  test/shared-money-origin.integration.test.ts
```

