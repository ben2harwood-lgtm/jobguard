# MIGFIX-6 builder receipt

Piece: MIGFIX-6, repair recovery source priority, allocation history and fee recomputation. Branch `codex/sandbox/migfix-6`. Migration number 0157 (main already has 0150, 0151, 0153, 0154; 0152 and 0155 are open PRs). Not independently verified, not accepted.

## What changed (three named parts, no shared formula)

1. Legacy derivation (`approve_synthetic_landing`, `reverse_synthetic_landing`, reference v1): eligible net may not exceed allocated gross (routine refusal plus table CHECK `landing_allocation_eligible_within_gross`); a reversal recomputes the cumulative position over every allocation and every reversal; plan credit only from a settled v1 plan fee (same expression the approval routine uses).
2. Current allocator (`write_recovery_allocation` + `recovery-allocation-repository.ts`): fresh eligibility after a claim amendment; a recorded, still-current explicit remittance cannot be omitted (refusal `ALLOCATION_SOURCE_REQUIRED`); new receipts allocate against the balances as at their own settlement (later credit/payment reversal not applied backwards); per-line gross from saved issued-line facts or the issuer's largest-remainder display allocation (penny lines allocate exactly); supplementary invoice composition from its issued lines only with rule `separate_invoice` (only from real `supplementary` bindings, never inferred from one account line); reversal survives an invalidated ORIGINAL remittance (new positive allocation from an invalidated source still refused). One new private helper `app.recovery_allocation_invoice_lines(uuid,uuid,uuid)`.
3. Component settlement (`guard_recovery_eligibility_v3`, `require_recovery_eligibility_v3_effect`, `recovery-eligibility-v3.ts`, `recovery-eligibility-v3-repository.ts`): F18 statutory interest counts only when its own receipt (`receipt-interest-120`) settled; principal only gives 250,000p, with interest settled 262,000p; the earlier review is unchanged.

Ben's decisions applied: decision 7 (not touched by this piece), decision 8 (rules a to e accepted; none of them is in this piece). The three draft BLOCKING questions took the draft's own leans: keep the 262,000p assertion and settle the interest receipt in set-up; permit the saved F7 path only from real immutable issued-line bindings; saved allocation reversal is not blocked by an invalidated original remittance.

## Files

- packages/db/migrations/0157_recovery_money_integrity.sql (new), packages/db/src/migrate.ts (registration), packages/db/MIGRATIONS.md
- packages/db/src/recovery-allocation-repository.ts, packages/db/src/recovery-eligibility-v3-repository.ts, packages/core/src/recovery-eligibility-v3.ts
- packages/db/test/migfix-6.integration.test.ts (10 failing-first regressions), packages/db/test/migfix-6-upgrade.integration.test.ts
- docs/contracts/recovery-allocation-v1.md, docs/contracts/recovery-eligibility-v3.md
- config/agent-lane-assignments.json (own lane entry `migfix-6`)
- Set-up only, own commit: packages/db/test/recovery-eligibility-v3.integration.test.ts, recovery-insurer-money.integration.test.ts, recovery-timing-pin.integration.test.ts, apps/web/e2e/CH-7.spec.ts (before/after below)

## Failing-first evidence (unchanged origin/main 0349f906, commit d7ce4a07)

All ten new tests fail at baseline for the audited reason (log: /private/tmp/claude-501/mf6/baseline-all.log, baseline-f7.log): eligible 100000 from 1p accepted; second reversal leaves landed 100000; unpaid plan reversal credit 6000; amendment allocation accepted; omitted remittance accepted (pro-rata); later credit gives catch 17625000/133; penny lines refuse `FRACTIONAL_CASE_SPLIT`; F7 supplementary and invalidated-remittance reversal refuse `ALLOCATION_SOURCE_REQUIRED`; F18 gives 262,000p with interest unsettled. After implementation all pass.

## Commands (real PostgreSQL 16 embedded, runtime role `NOSUPERUSER NOBYPASSRLS`, via heavy-slot, `vitest --maxWorkers=2`, at most 3 files per run)

| Command | Exit | Counts |
| --- | --- | --- |
| baseline: migfix-6.integration.test.ts (10 tests) | 1 | 10 failed |
| final A: migfix-6.integration + migfix-6-upgrade + recovery-eligibility-v3 | 0 | 3 files, 42 tests passed |
| final B: recovery-allocation + recovery-line-allocation + recovery-allocation-races | 0 | 3 files, 36 passed |
| final C: recovery-insurer-money + recovery-timing-pin + practice-facts | 0 | 3 files, 97 passed |
| final D: recovery-allocation-upgrade + recovery + tenancy | 0 | 3 files, 25 passed |
| earlier: recovery-messages + recovery-cases.workbench + tenancy | 0 | 3 files, 148 passed |
| core: recovery-eligibility-v3 + practice-facts + recovery-allocation unit | 0 | 3 files, 114 passed |
| `pnpm typecheck` (core, db) / `node tools/lint.mjs` / `node --test tools/*.test.mjs` | 0 | 85 node tests passed |

The final A to D runs were made at commit 199277ac; the only later change is the clean merge of origin/main (6cc52e91), after which db typecheck and `tools/lint.mjs` were re-run (exit 0), not the database suites.

## New GRANTs

None. No table, column, policy or trigger added. One CHECK constraint on `app.landing_allocation` (validates every existing row; a historical bad row would fail the migration loudly). `app.recovery_allocation_invoice_lines(uuid,uuid,uuid)` is owned by `jobguard_migration`, SECURITY INVOKER, pinned `search_path`, EXECUTE revoked from PUBLIC, `jobguard_runtime` and `jobguard_infrastructure`. Five routines are replaced with unchanged signature, owner, security mode and privileges (proved in the upgrade test).

## Set-up only changes to merged tests (before to after)

The merged F18 tests assumed the one £3,000 receipt also settled the £120 interest. No assertion, pin, fingerprint or timeout changed; each now also settles `receipt-interest-120` (through `PracticeFeedRepository.factsCommand`).
- recovery-eligibility-v3.integration.test.ts: fixture `advance` also accepts the interest movement via factsCommand; after the F18 `receipt-3000` settle in "DW1 ... persists exact Q/reason" add `if(name==="F18")await f.advance("receipt-interest-120");`; the microsecond-timestamp F18 test adds `await f.advance("receipt-interest-120");`.
- recovery-insurer-money.integration.test.ts: fixture `advance` settles the interest receipt after a settled `receipt-3000`; the "unbound review control" job captures the advance reply and settles the interest receipt too.
- recovery-timing-pin.integration.test.ts: new fixture method `settleInterest()` called before the two F18 "retains full figure"/"product-only controls" reviews that expect 262,000p.
- apps/web/e2e/CH-7.spec.ts: for F18 after `settle()`, POST `practice-facts` advance of `receipt-interest-120`. NOT RUN (browser not run in this sandbox).

## STOP and open items

- NO dedicated component-source binding table: a new table would need new entries in the pinned catalog lists in packages/db/test/tenancy.integration.test.ts (lines about 319 to 346 for RLS, about 564 for owner), an existing merged pin, so that part was stopped. Instead the interest source is derived from the same feed event in the guard and the deferred check, and recorded as `interestSourceEventId` in the audit entry (checked when present). Before: no such list entry; after (if Ben wants an immutable binding table): add `recovery_eligibility_v3_component_source` to those two lists.
- No change was made to apps/api/src/auth/context-boundary.test.ts or any pin or fingerprint.
- Not run: browser/e2e (CH-7.spec.ts set-up line, PRACTICE-FACTS-1, M4-1-S), `pnpm build`, `pnpm test` (full), OpenAPI checks, fresh-database CI path beyond the integration tests above. GitHub CI must run them.
- Decisions taken on the draft's leans that a reviewer may want to confirm: (a) a recorded explicit remittance that was only reviewed (not yet approved) still blocks a later pro-rata review for that receipt until it is invalidated; (b) interest timing against case opening is not applied (a settled interest receipt counts); (c) the settled-receipt cutoff for reversals uses the credit note or payment reversal `created_at` against the receipt movement `created_at`.

not independently verified, not accepted
