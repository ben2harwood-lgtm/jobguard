# 0505 — SV-7A / CH-4 on-site diary admission (RED)

The intake routine starts from 0303, the receipt validator from 0144, and site
capture from 0144 with the tenant serializer added by 0380. On-site notes now
preserve `onSite: true` and create a diary source receipt plus the immutable CH-4
first-site-evidence candidate. The existing capture path also cancels a preceding
finished-on-site marker when later work arrives. Off-site notes and customer
messages create no work event.

Admission uses 0380's private `ch4_admit_place` with `restart`, after exact replay,
owner, lock and live checks and before any intake effect. Capture rechecks the
same admission before per-job event serialization. Lock order remains job SHARE,
command ID, tenant capacity (184), job event (144), then audit. Admission, original
bytes, evidence, receipt, work event, projection and audit commit or roll back
together. Missing accepted activation/agreement facts, including the existing
shared practice-session exclusion, still fail closed under MON-1.

The two existing receipt source-kind/shape checks retain their whole predecessor
expressions and add the constrained diary shape. The validator binds the on-site
entry to the exact tenant/job, actor, fact key, verified original evidence,
version, receive time and hash; invalidated evidence cannot qualify. No table,
column, role, grant, policy or callable helper is added. All previous routine
owners, security modes and ACLs survive CREATE OR REPLACE, so the shared LP-0,
SERIOUS-B5, entitlement and privilege inventories require no added identities.
No hidden tables enter the intake/capture/validation path or the diary response.
The API uses the existing work-state error adapter for capacity conflicts.

No data backfill or historical on-site event synthesis. Forward-fix only: retain
immutable evidence/events and replace the affected routine in a later migration
if necessary; never remove already-recorded facts. Existing receipt replay stays
available after a lock or lifecycle change. No new alerts, money or provider work.

Validation and remaining gates are recorded in the router commit message. Real
PostgreSQL fresh/upgrade, adversarial, Test O/isolation and browser suites run in
CI; this sandbox does not start PostgreSQL or bind localhost. A fresh independent
Claude RED review is required before merge.

LATER / SIMPLICITY (initial source review): `ch4_capture_site_source` repeats the
photo/document exclusion checks before and after taking the source-job lock. A
future separately scoped cleanup could share the classification step, reducing
the risk that the two lists drift. Existing lock/exclusion behavior is preserved
in this piece; this observation is non-blocking.
