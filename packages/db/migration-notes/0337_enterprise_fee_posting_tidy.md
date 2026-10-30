# 0337 enterprise fee posting tidy-up (ENT-7c, RED)

Closes the stage-end follow-ups from #359/#378: a compensation consumes only the
remaining balance of an actual same-tenant, same-agreement accrual, newest first.
A section can produce several balanced compensation journals, each naming the
accrual it offsets. Partial unique indexes replace the one-journal-per-section
constraint. Posting remains serialized by the existing tenant statement lock;
no runtime grants, RLS policies, authority checks or production gates change.

Same-key replays retain the existing receipt. Fresh-key replays record their
command receipt but append no audit event, including statements with no journals.
The original statement-posted event remains the authoritative completion marker.

Forward fix only: existing immutable statements, journals and audit events are
preserved. Historical mislinked compensations are not rewritten. Stop posting and
use a reviewed forward migration if a deployment needs correction; rolling back
the old uniqueness constraint after split compensations exist is unsafe.

Validation: the posting integration suite covers multi-accrual offsets, repeated
reversals, command replay/races, zero-result audit/receipt stability and cross-company
access. The upgrade test preserves populated rows and routine security metadata.
PostgreSQL and browser suites run in GitHub CI, not this sandbox.

Northside reseed handoff: after applying 0337, run the existing ENT-11b browser
journey on a fresh synthetic practice tenant. It starts Northside practice and
rebuilds orders, extras, billing facts and fee statements through the real commands
with made-up data; its fee assertion uses the exported extra's settled allocation.
Preserve/archive the previous synthetic run rather than deleting or editing its
immutable fee history. This sandbox cannot run PostgreSQL or bind localhost, so
no stored demo data has been reseeded here.
