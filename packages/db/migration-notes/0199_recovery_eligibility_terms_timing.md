# 0198 — CH-7-REST-B DW3 (decision 123, ruling 130 option B)

Prerequisite: 0197 / CH-7-REST-A (#292 merged). Synthetic only; production remains disabled.

`CREATE OR REPLACE` of only `app.guard_recovery_eligibility_v3()` and `app.require_recovery_eligibility_v3_effect()`, preserving SECURITY INVOKER, owner, fixed search path, grants, RLS, triggers and all supplier/F21/session/insurer/completeness predicates. No objects, privileges, backfill or historical row mutations. No inventory additions needed.

For withheld-payment reviews the guard looks up the exact immutable approval (tenant/job/case, pinned versions, the job's v3 policy) under the existing case lock and compares original settlement with `approved_at` as full-precision timestamptz values.

Option B (ruling 130): fee terms never gate a review.
- No approval row: `pre_terms` stays false, the guard expects exactly the pre-DW3 result, and nothing is raised. There is no `ELIGIBILITY_TERMS_DECISION_REQUIRED` anywhere in the routines any more.
- Approval strictly later than the settled source: expected result is the decision 123 exclusion (Q 0, exact wording; F18 interest uses its own settlement). Before-opening, insurer and pending precedence is unchanged.
- Approval earlier than or equal to the settlement: no exclusion; the review qualifies normally.
- A forged positive result, forged amount or forged lines are still rejected (`ELIGIBILITY_FIXTURE_MISMATCH` / `ELIGIBILITY_LINES_REQUIRED`), so the guard stays fail-closed on money.
- `require_recovery_eligibility_v3_effect` demands a matching `termsApprovalId` audit reference only when the saved result carries the terms-exclusion wording; a review produced without terms needs none. No business locks are added after audit.

Upgrade test source: `recovery-terms-timing-upgrade.integration.test.ts` (A-schema saved outcome, claim lines, real authorization, approval and audit snapshots; B alone, later migrations twice, exact replay and new exclusion; row/type comparator controls). PostgreSQL NOT RUN locally; do not infer a pass from source inspection.

Forward-fix only: retain immutable outcomes/approvals/audit; correct guards through a later reviewed migration. Never restore permissive guards or delete history. Deployment is held pending independent RED acceptance and CI database/browser execution.
