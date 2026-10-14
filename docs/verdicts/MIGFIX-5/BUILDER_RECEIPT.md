# MIGFIX-5 builder receipt (Claude Sonnet 5.5, 14 Oct 2026)

Not independently verified, not accepted. Builder only; a different-model verdict and separate acceptance are still required. No PR opened.

Migration: `0156_customer_billing_integrity.sql` (the draft's 0154 is superseded; main has 0150, 0151, 0153, 0154; open PRs use 0145, 0147, 0152, 0155). Base: origin/main `0349f906`.

## What was built

1. `app.lock_final_account` (0132) restated in place: after the existing variation row locks, refuses with `STALE_OR_BLOCKED_FINAL_ACCOUNT` (repository code `STALE_REVISION`) any account revision that lacks a currently approved variation revision of the job. Approval-first, lock-first and in-flight orderings are proven on real PostgreSQL (the approval writer locks the variation row first, so no new lock edge and no deadlock path).
2. `app.issue_practice_customer_credit_note` (0028) restated in place: cumulative credited net can never pass the original invoice net (refused in SQL, not only in the repository); each credit's VAT keeps the merged per-credit half-up rule but is capped at the VAT still remaining on the original invoice. `PracticeInvoiceRepository.previewCredit` applies the same cap so preview and issued credit agree.
3. Both are `CREATE OR REPLACE`: owner, SECURITY DEFINER flag, pinned `search_path` and ACL are unchanged (proved by the upgrade test comparing owner and ACL for every routine).

New GRANTs: none. New tables/columns/policies/helpers: none.

## Held (not built), with reasons

- **Tests 1 and 2 (legacy issuer needs lock and completed check; second full invoice refuses).** Open PR #189 (`sv5pre`, migration 0147, `packages/db/migrations/0147_final_check_prerequisites.sql:288`) already restates `app.issue_practice_customer_invoice` with exactly these guards (`app.require_authoritative_final_check`, lock revision match, `FINAL_INVOICE_ALREADY_ISSUED`). A 0156 restatement would either be overwritten by or overwrite it, and requiring a lock would break about 15 merged legacy fixtures. Re-run draft tests 1 and 2 after #189 merges. The lock-bound path's refusal of a second full invoice and 132,000p aggregate is covered here as a regression (it already passes).
- **Test 7 (real, parseable PDF) and the PDF storage part.** Ben decision 7: real PDFs later.
- **Cumulative whole-invoice VAT rounding for credits (Ben decisions 7 and 8a: stray penny in the customer's favour).** Needs an existing merged expectation to change, and the narrow override was not named for this change. Exact change, `packages/db/test/practice-invoice-audit.integration.test.ts` "split credits cannot exceed original net principal":
  - line 107: `balancePence:1` becomes `balancePence:0`;
  - line 109: `.toBe(24003)` becomes `.toBe(24004)`.
  The matching rule (cumulative VAT on cumulative net, the credit reaching full net takes exactly the original VAT, so 10,001 then 10,002 net credit 12,001 then 12,003) was built and passed my tests, then removed. To apply: in `0156` replace the `tax:=least(...)` line by `cumulative_tax:=CASE WHEN credited_net+p_net_pence=inv.net_pence THEN inv.tax_pence ELSE least((credited_net+p_net_pence+2)/5,inv.tax_pence) END; tax:=greatest(least(cumulative_tax-credited_tax,inv.tax_pence-credited_tax),0);`, mirror in `previewCredit`, and in `migfix-5.integration.test.ts` set the split test to `[-12001,-12003]`, totals `{net:20003,tax:4001,gross:24004}`, last-penny gross arg `24004`.

## Failing-first and results

| Command (all via heavy-slot, 2 workers, at most 3 files) | Exit | Result |
|---|---|---|
| `vitest run test/migfix-5.integration.test.ts` on baseline (0156 unregistered, repository unchanged) | 1 | 5 failed, 1 passed (the 1 is the 132,000p regression); `evidence/base-run.log` |
| `vitest run test/migfix-5.integration.test.ts test/migfix-5-upgrade.integration.test.ts` | 0 | 2 files, 7 tests passed; `evidence/head-run.log` |
| `test/practice-invoice-audit` + `src/practice-invoice-repository.test.ts` + migfix-5 | 0 | 3 files, 16 passed |
| `final-account-lock`, `UIWIRE-11`, `practice-invoice-audit` | 0 | 22 passed |
| `final-account-lock-invoice`, `-reveal`, `-upgrade` | 0 | 3 files, 13 passed |
| `UIWIRE-11`, `UIWIRE-12`, `final-account` | 0 | 3 files, 27 passed |
| `job-work-state-post-lock`, `audit-api-file-final-account`, `recovery-allocation` | 0 | 3 files, 39 passed |
| `audit-api-variation`, `variation`, `shadow-catalog` | 0 | 3 files, 13 passed |
| `pnpm typecheck` in packages/db | 0 | clean |

Note: `migfix-5.integration.test.ts` imports fixtures from `final-account-lock.integration.test.ts`, so that file's own tests also run inside it (existing pattern in `final-account-lock-invoice`).

## Not run

`pnpm test` (whole suite), `pnpm build` (only core and storage built, for the test environment), `pnpm test:migrations`, `pnpm test:db`, browser journeys, OpenAPI check, UIWIRE-10/11 e2e. GitHub CI must run them. Upgrade from the preceding schema is proved for the own step only (`MIGFIX-5.UPGRADE`).

## Other findings for the reviewer

- Legacy-issuer invoices have no binding row; that stays supported by the lock-bound supplementary path. Not changed.
- If #189 and this branch both merge, 0156 does not touch the legacy issuer, so there is no overwrite.
- No merged test expectation, pin, fingerprint or timeout was changed. `apps/api/src/auth/context-boundary.test.ts` untouched.
