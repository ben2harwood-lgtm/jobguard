# 2029 · V2-B1C immutable walk photo filing (RED)

Only the dedicated `jobguard_v2_local` database with the 2001 firm policy is
changed. Bootstrap applies this after 2008. This base has no 2054 line; at
integration keep 2029 above 2054, which must stay last. Other databases return
before any change; purchase-order-audit's deferral and absence assertion cover
that boundary.

No backfill. The new table records revisions of explicit photo-to-room filings,
keyed by tenant, job, session, photo capture order and expected version. Earlier
filings and the original walk entries remain unchanged. The target must be a
room in the same session; the source must be a photo. The trigger refuses gaps.
Runtime has SELECT/INSERT only, forced tenant/job RLS and a restrictive
`v2_practice_firm` policy copied from 2001's job-visibility pattern. No existing
table grants or policies change.

The repository serializes filing commands per job with the existing advisory
lock pattern, checks the current version and editor, and appends
`v2.walk.photo_filed` in the same transaction. Exact replay returns the original
receipt before version checking and appends nothing. Payloads contain identifiers
only, never room labels, photo content or hidden findings.

`tools/v2/seed.integration.test.mjs`'s B1C describe supplies the real PostgreSQL
proofs: read/re-file, original preservation, replay, changed replay, stale and
racing writes, wrong session/kind, direct SQL gap refusal, second-firm
SELECT/INSERT/UPDATE/DELETE refusal, catalog grants and forced row/event rollback.
These are written, not executed in the restricted builder sandbox. CI1 must run
the full seed suite. Browser proofs use the existing one-time sign-in, HTTPS
origin and 360/1280/phone contexts; three fresh-stack runs and rendered inspection
remain required. SX refusal helpers are absent on this base: rule 29 is pending
V2-SX. There is no closed-session state on 2008, so that conditional refusal is
inapplicable.

Forward-fix with a later reserved V2 migration. To revert the application, retain
the filing rows and original entries; do not delete evidence or replay migration
2008. No external action, paid AI call or new operational alert is introduced.
