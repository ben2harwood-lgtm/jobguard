# M3-3 sync download contract - named partial

Status: synthetic policy core plus dark server slice; check lane RED (authentication, permissions, data).
The core signs nothing; the unmounted server slice below issues synthetic envelopes only.
No provider is configured and no row is replicated here.
Complete M3-3, M3-4, G3 and every downstream edge remain HELD.

## What exists

`packages/core/src/sync-download.ts` decides, from explicit facts, what a download may contain.
It performs no authentication, SQL, network call or signing.

- Request: `sync-subscription-request.v1` has only `requestedTenantId`, the one issued `profile`
  (`contractor_assigned_jobs.v1`) and an optional `jobIds` list. The list can narrow, never widen.
  There is no tenant, actor, role, membership, query or environment field; each is refused.
- Authority facts are supplied by the server after it rechecks current membership. They are never request data.
  Only `active` authority in the requested tenant, with role `operative` or `supervisor` (the existing site-visit
  read rule), receives rows. Every other case (revoked, expired, unknown, other tenant, other role, and missing,
  undefined or malformed authority) returns the byte-identical refusal `authority_required` with `cleanup: "required"`.
- Projection copies seven named fields only: `jobId`, `workOrderId`, `reference`, `priority`, `issuedOn`,
  `dueOn`, `openVisitId`. These are the existing `siteAssignedJobsV1` fields; adopting them for sync still
  needs the Q03 ruling. Resident, address, price, bank, credential and shadow-signal fields are never copied,
  however wide the replication source is. A malformed permitted row, or two permitted rows with one `jobId`, refuses
  the whole read (`source_invalid`: fail closed for downloads). That refusal still carries `admittedJobIds` (ids only) and
  `cleanup: "required"`, so reconcile still tombstones delivered ids that authority no longer admits and keeps the rest.
  A job id on another tenant's row is never delivered and never counts as a duplicate.
- Paging is stable keyset order by `jobId`. Repeating a cursor returns the same rows; each page re-evaluates
  current authority, so loss of authority between pages gives the identical refusal. 401+ eligible rows are tested.
- Reconcile: `planSyncReconcileV1` lists identities (`{ jobId }` only) that must be removed locally. A rebuild is
  simply the current decision, so a purged identity returns only if current authority admits it.
- Token claims: `deriveSyncTokenClaimsV1` returns claim content (`sub`, tenant, membership, profile, generation,
  audience, `iat` and `exp`) only when the subscription is currently allowed. `iat` and `exp` are whole seconds (JWT NumericDate), explicit
  inputs with no default and millisecond-named inputs refused; no lifetime, revocation delay or offline lease is chosen here.
- Errors carry only `SYNC_DOWNLOAD_INVALID_INPUT`, with no Zod issues, raw input or cause.

## What this does NOT prove (HELD)

- Provider enforcement: no PowerSync stream rules, engine, version or test command is selected, so the
  independence from PostgreSQL RLS (R10) is not proved. A TypeScript decision is a unit specimen, not the provider policy.
- No PostgreSQL repository, authoritative-source query, migration or grant (Standard F: zero new GRANTs).
- Mobile exchange/refresh, production scoped-token signing, region deployment and the revocation boundary (D08, D04 proposed).
- Small-builder profile (unspecified, so refused), physical-device cleanup, resync after schema migration, G3.

## M3-3 server slice (dark)

`apps/api/src/sync/download.application.ts` adds a synthetic server application around the pure core.
It is unmounted: no HTTP route, PowerSync service, hosting, provider key, environment variable or database grant
is introduced. The constructor defaults off, and requires both `enabled: true` and server-owned
`environment: synthetic_demo`; production and pilot values always fail before store access.

The trusted `SyntheticSyncStore.readCurrentSession` boundary must authenticate an opaque session and return an
atomic current snapshot of session/user, active tenant, membership, assignment identities and source rows. This
slice provides deterministic test adapters only, not a production repository.
The adapter must durably advance generation on revoke, tenant switch and reauthorization, including a return
to an earlier scope; the application additionally hashes current authority to catch unversioned scope changes.
Client requests supply selectors, paging and previously delivered identities, never authority facts. The application checks user/tenant binding
and applies the existing operative/supervisor assigned-job profile even to an unfiltered two-tenant source.
Unknown query and field selectors are refused. Secrets, residents, financial data and shadow fields are omitted
by the core's seven-field allowlist; no raw source or token is included in download results or errors.

Subscribe issues a signed synthetic envelope using an explicitly public specimen HMAC key. This is deliberately
not a PowerSync credential/JWT or a production trust boundary. Its audience is `jobguard-synthetic-sync-only`;
the envelope binds user, session, tenant, membership, generation, profile, selector and current authority hash.
A fixed 60-second test lifetime exercises expiry only and makes no D08 production lease decision. Every page
reads current authority again; expiry, session loss, tenant switch, revoked membership, changed role or changed
assignment prevents old-token downloads and emits identity-only cleanup obligations. Another permitted role or
new assignment requires resubscription. The server checks authority even with a valid specimen signature.

Replays of a valid page are read-only and stable. Cleanup uses the full current allowed projection rather than
one page. Missing source rows become tombstones. A rebuild or replay cannot restore an identity absent from
current authority/source. The tests cover 401-row paging/interruption, duplicates, two tenants, multiple roles,
selector tampering, session binding, expiry, revocation and field exclusion independently of PostgreSQL RLS.
Amount/allocation mutations and locked-bill writes do not apply: this application has no write/command path;
locked-bill and financial source fields are explicitly tested as excluded.

No migration is needed. Provider stream configuration/enforcement, a production authenticated snapshot adapter,
approved-region deployment, D08 lease/revocation policy, physical-device cleanup, migration/resync and G3 remain
HELD. A returned tombstone is a cleanup instruction, not evidence that any device erased its cache. The core-only
limitations above still apply to the pure specimen; synthetic signing now exists only in this server slice.
