# M3-3 sync download contract - named partial

Status: synthetic, pure policy specimen only; check lane RED (authentication, permissions, data).
No token is signed or issued, no provider is configured and no row is replicated here.
Complete M3-3, M3-4, G3 and every downstream edge remain HELD.

## What exists

`packages/core/src/sync-download.ts` decides, from explicit facts, what a download may contain.
It performs no authentication, SQL, network call or signing.

- Request: `sync-subscription-request.v1` has only `requestedTenantId`, the one issued `profile`
  (`contractor_assigned_jobs.v1`) and an optional `jobIds` list. The list can narrow, never widen.
  There is no tenant, actor, role, membership, query or environment field; each is refused.
- Authority facts are supplied by the server after it rechecks current membership. They are never request data.
  Only `active` authority in the requested tenant, with role `operative` or `supervisor` (the existing site-visit
  read rule), receives rows. Every other case (revoked, expired, unknown, other tenant, other role, missing
  authority) returns the byte-identical refusal `authority_required` with `cleanup: "required"`.
- Projection copies seven named fields only: `jobId`, `workOrderId`, `reference`, `priority`, `issuedOn`,
  `dueOn`, `openVisitId`. These are the existing `siteAssignedJobsV1` fields; adopting them for sync still
  needs the Q03 ruling. Resident, address, price, bank, credential and shadow-signal fields are never copied,
  however wide the replication source is. A malformed permitted row refuses the whole read (`source_invalid`).
- Paging is stable keyset order by `jobId`. Repeating a cursor returns the same rows; each page re-evaluates
  current authority, so loss of authority between pages gives the identical refusal. 401+ eligible rows are tested.
- Reconcile: `planSyncReconcileV1` lists identities (`{ jobId }` only) that must be removed locally. A rebuild is
  simply the current decision, so a purged identity returns only if current authority admits it.
- Token claims: `deriveSyncTokenClaimsV1` returns claim content (`sub`, tenant, membership, profile, generation,
  audience, issue and expiry) only when the subscription is currently allowed. Issue and expiry are explicit
  inputs with no default; no lifetime, revocation delay or offline lease is chosen here.
- Errors carry only `SYNC_DOWNLOAD_INVALID_INPUT`, with no Zod issues, raw input or cause.

## What this does NOT prove (HELD)

- Provider enforcement: no PowerSync stream rules, engine, version or test command is selected, so the
  independence from PostgreSQL RLS (R10) is not proved. A TypeScript decision is a unit specimen, not the provider policy.
- No PostgreSQL repository, authoritative-source query, migration or grant (Standard F: zero new GRANTs).
- Mobile exchange/refresh, scoped-token signing, region deployment and the revocation boundary (D08, D04 proposed).
- Small-builder profile (unspecified, so refused), physical-device cleanup, resync after schema migration, G3.
