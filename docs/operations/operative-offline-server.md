# ENT-12 dark server slice

`SiteExtraApplication.logOffline` and `SiteExtraRepository.logOfflineSiteExtra`
reuse the existing command and origin writer. Neither has an HTTP/native route.
The application refuses every environment except `synthetic_demo`; persisted
contractor/job gates also require synthetic work orders. G3 stays closed.

Preserve the `offline-intent.v1` command ID and payload across reinstall/retry.
The authenticated raising member is retained as `raising_membership_id`;
devices cannot nominate another user. `clientMetadata.capturedAt` is labelled
client metadata, stored as `device_captured_at`; `hlc.nodeId` is an unverified
device label stored as `device_id`. HLC counters confer no order or authority
and are not persisted. The existing origin writer chooses server time, role,
assignment and work-order revision at upload. Agreement selection uses server
origin time. Metadata authorizes no fees or commercial actions.

Replaying the same envelope returns the existing extra. Reusing its ID with a
changed capture timestamp, device label or text conflicts. The existing
`toLogSiteExtraV1` converter deliberately still discards metadata: its callers
and stored receipt formats are unchanged.

Uploads recheck current membership, role and assignment. `EXTRA_FORBIDDEN`
means membership/role no longer permits upload; `NOT_FOUND` means the job is
unavailable to this operative, including reassignment. These closed codes
explain refusal without revealing another customer's job. Refusal creates no
origin. Downloads use the assigned-job projection and contain no resident
contacts, financial records or shadow signals. No migration, new provider,
credentials, money path or operational alert is introduced.

Tests: `operative-offline.application.test.ts`,
`operative-offline.integration.test.ts`, and the ENT12 agreement-clock case in
`enterprise-domain/fee.test.ts`. The PostgreSQL download test deliberately uses
a superuser connection to prove filtering independently of RLS. Execution
results and CI holds are recorded in the commit/PR description.

Native screens, encrypted storage, durable device queue, transport
authentication, physical-device journeys and G3 evidence remain with the
native foundation/ENT-12/M3-7 tasks. This slice does not enable distribution.
