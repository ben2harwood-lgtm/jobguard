# SV7A-INT-A HTTP handoff — DEPENDENCY-BOUND

25 October 2026 · C268 · synthetic only · build-ahead on
`5ca7e813a43225743381ade0dd528d1c914db538` (SV7A-INT-P, in review).
This records a construction hold; it installs no HTTP interface.

The authoritative draft is `DRAFT SV7A-INT-A` at lines 3581–3617 of
`JobGuard-BUILD-AHEAD-ALL-SIX-CORRECTED-DRAFT-20261020T230116Z.md`, with its
shared gates and ownership rules. Dispatch supersedes DRAFT/issuance and permits
this lane registration. It does not supply missing source authority or persistence.

## Installed dependency evidence

- Parent P's receipt and persistence contract explicitly record STOP/incomplete.
  `packages/db/src/job-source-intake-repository.ts` and its error seam do not exist;
  no `JobSourceIntakeRepository` is exported by the DB package.
- Migration 0210's only `app.mon1_admit_place(uuid,uuid,text,uuid)` definition
  unconditionally raises `METER_PLACE_SOURCE_HANDOFF_HELD`. Migration 0201's
  only `app.ch4_admit_place(uuid,uuid,text)` definition unconditionally raises
  `CAPACITY_ADMISSION_UNAVAILABLE`. The checked diary delegation is absent.
- The diary source-kind extension, complete lock order and upstream typed
  lifecycle/admission error mapping remain P/source-owner deliverables.
- C's receipt/schema/classifier definitions exist, but their public core barrel
  exports are absent. Shared exports belong to the coordinator.

The draft expressly says missing real persistence or upstream error mapping
blocks API issuance and forbids temporary success adapters. Therefore there is
no partial message/off-site writer, dormant route, fabricated principal, local
admission algorithm, or new 503-only endpoint in this change. A01–A06 remain
DEPENDENCY-BOUND, with no acceptance claim. Existing GET modules stay unchanged.

## Exact handoff needed to resume

First supply the accepted P implementation and exact public exports, checked
CH-4/MON-1 delegation and error contract, accepted C exports, verified dated
17-October handoff and recorded synthetic tester-as-fictional-customer authority.
Build-ahead permission does not establish parent acceptance or merge.

Then implement tests first in the draft's new files: `JobSourceIntakeApplication`
authenticates with `PracticeAccess.job()` before informative validation, delegates
the whole genuine context/digest to P, and selects source kind from the route.
Both transports reject unknown query/body fields, malformed JSON and oversized
text, preserve exact text/command identity, and return immutable P/C receipts.
Known errors only: 400 invalid input, 401 unauthenticated, 403 non-synthetic,
404 hidden/foreign, 409 idempotency conflict, the exact accepted lifecycle/offer
mapping, and redacted 503 unavailable. All responses require no-store, including
framework/parser failures; a cookie or supplied metadata never creates authority.

Coordinator-only additions, after the real seams exist, remain:

- `apps/api/src/workspace/application.ts`: `jobSourceIntake: { diary, message }`.
- `apps/api/src/workspace/index.ts`: application/error exports.
- `apps/api/src/app.module.ts`: additive intake controller registration.
- `packages/core/src/watchdog.ts`: exact mutation keys
  `nest:/jobs/:id/diary/intake`, `nest:/jobs/:id/customer-messages/intake`,
  `/api/jobs/[id]/diary/intake`, and `/api/jobs/[id]/customer-messages/intake`
  as `watchdog_live_only` (all four proposed routes are POST).
- Regenerate `apps/api/openapi.json` with its existing generator after composition.

Those are integration requirements, not entries installed by this stopped leaf.
No shared auth, PracticeAccess, cookie, old source modules or parent routes/tests
are edited. No request path may read/instantiate shadow observation workers.

## Retained verification and holds

A01–A06 require real persisted sessions and both transports, exact DB/read
identity/hash/time, session/tenant isolation and revocation, authorized lifecycle
refusal and replay, zero/many-signal equality/query-path proof, and conflict/no
financial effects. Every eventual guard requires a removal-sensitive mutation
check. No executable guard was added here, so no such mutation result is claimed.
The actual HTTP/DB suite remains a required CI deliverable after P exists;
mocked controller tests cannot replace it. D/M/O journeys remain downstream.

Migration 0231 stays reserved and unwritten. No database object, grant or policy
changes: LP-0 (including authority paths), tenancy, SERIOUS-B5 and contractor
entitlement catalogue additions are inapplicable here. Preserve every existing
freeze; future concrete SQL objects need exact catalogue rows and mutation checks.
No rollback/backfill is needed for this documentation-only change.

H-CH4, H-MON1, accepted P/C, H-17OCT verification and the named tester authority
remain open dependency evidence. H-ISSUE is supplied by C268; the dispatch permits
the own lane file. Shared runtime integration, actual CI, two independent Claude
exact-head verdicts and separate acceptance remain required. H-SV5/H-SV6 apply to
later Test O/eligibility; H-LIVE and production/provider/fee gates remain closed.
