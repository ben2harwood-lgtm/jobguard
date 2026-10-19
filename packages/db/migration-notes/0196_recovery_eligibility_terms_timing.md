# 0196 — CH-7-REST-B DW3 (decision 123)

Prerequisite: 0195 / CH-7-REST-A #292. Provisional next-free number, dispatcher renumbers. Synthetic only; production remains disabled.

Replaces only `app.guard_recovery_eligibility_v3()` and `app.require_recovery_eligibility_v3_effect()`, preserving SECURITY INVOKER, owner, fixed search path, grants, RLS, triggers and all supplier/F21/session/insurer/completeness predicates. No objects, privileges, backfill or historical row mutations. No inventory additions needed.

For withheld-payment reviews, the guard obtains the exact immutable approval for tenant/job/case and pinned version identifiers, with the job's v3 policy, under the existing case lock. Original settlement and approval are compared as PostgreSQL timestamptz values, including microseconds. Pre-terms settled principal contributes zero; F18's interest uses its own settlement timestamp. Existing before-opening, insurer, unpaid and component exclusions retain their reasons. Otherwise decision 123's exact note is saved. Audit completeness requires the matching approval reference. No business locks are added after audit.

Missing approval and equal timestamps stop with `ELIGIBILITY_TERMS_DECISION_REQUIRED` / SQLSTATE 0A000. This is an implementation hold for expressly undecided cases, not approval of a customer-facing refusal or saved-result contract. Reversed transaction-start/commit semantics remain STOP-1. No commit-order interpretation is implemented. Supplier-credit terms are STOP: the current terms writer cannot approve that category and is outside this order's edit scope.

Upgrade test source: `recovery-terms-timing-upgrade.integration.test.ts`; A-schema saved outcome, claim lines, real authorization, approval and audit snapshots; B alone, later migrations twice, exact replay and new exclusion; row/type comparator controls. PostgreSQL NOT RUN locally. V1 populated upgrade coverage and broader routine-security/catalog comparisons are also authored but remain dispatcher execution/acceptance work; do not infer a pass from source inspection.

Forward-fix only: retain immutable outcomes/approvals/audit; correct guards through a later reviewed migration. Never restore permissive guards or delete history. Deployment is held pending decisions, fixture amendments, CI database/browser execution and independent RED acceptance.
