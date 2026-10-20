# 0207 — withheld-payment pursuit requires terms on every policy

CH-7-REST-C, synthetic-only build-ahead from #298 head `98a7a80515c4d12db6f97154d7192d33ea4b5157`. B must integrate before C; frozen main target `dc5721230fd8aedbf2d9d0457789074b66b48765`. Number 0207 is dispatcher-reserved.

Replaces only `app.recovery_case_terms_approved(uuid,uuid,uuid)`, removing `j.fee_policy_version IS DISTINCT FROM 'reference_fee_policy_v3'` from the OR predicate. The job join and actual approval predicate stay intact. CREATE OR REPLACE retains owner and ACL, with unchanged signature, STABLE, SECURITY INVOKER and search path. No backfill, row write, new object, grants, RLS change, catalogue edit or alert.

Null/v1 withheld jobs can no longer insert previews, approvals or sink receipts through the existing three case-locking triggers. Approval writer remains v3-only; old jobs are neither converted nor supplied with fabricated terms. Non-withheld cases retain their prior behavior. Exact saved replays and historical pursuit rows are preserved; old approvals do not grandfather new writes. This is a pursuit guard, not a fee-entitlement or collection change.

The new integration and own-migration upgrade suites are authored and statically typechecked; PostgreSQL execution is CI-only. The upgrade proof installs every predecessor, seeds null/v1 queued pursuit, delivered merchant controls and a v1 delivered pursuit with a due reminder, compares canonical named rows, full format_type types and original primary-key identities after 0207 alone, then runs successors twice. It checks owner/ACL/security and the unchanged writer/callers immediately around 0207 only. Rolled-back microsecond/type damage must fail; later nullable column, function replacement and inserted row controls must pass. Every compared table is populated.

Recovery: installation is transactional; an installation failure rolls back. After successful installation use a reviewed forward fix preserving the stronger guard and immutable history. Do not restore the policy exemption. Production, independent exact-head review, separate technical acceptance and prerequisite integration remain gated.
