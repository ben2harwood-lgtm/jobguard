# M3-2 mobile authentication contract — named partial

Status: pure contracts plus a DARK synthetic server seam with optional PostgreSQL persistence. Aggregate M3-2,
D08 and G3 remain incomplete. No native app, public route or live provider is enabled.

The server slice was checked against main/base
`32411c4e45a094cbe65ae90ee1d5debd1f266e2a`. Main already contained the pure schemas
and lifecycle decisions below, but no exchange issuer, rotation or device records.
The current brief authorizes this synthetic server slice. Auth.js (`@auth/core`)
is absent from installed dependencies; the permitted synthetic seam uses the
existing `MemoryAuthProvider`, without adding packages or changing persisted auth.

## Boundaries and definitions

- Source authentication means the existing persisted session and current
  membership/SSO checks. A source-session UUID alone cannot authenticate anyone.
- Exchange selector means `mobile-exchange.v1` with only `requestedTenantId`.
  Parsing it establishes no membership. Source credentials and origin/CSRF
  treatment must use the existing bridge when an authorized implementation lands.
- Access and refresh specimens are separate strict objects, `mobile-access.v1`
  and `mobile-refresh.v1`, each with `credential`: exactly 43 base64url characters.
  These are candidate synthetic shapes, not a frozen public transport or a claim
  about entropy. A refresh specimen never authorizes a business command.
- A partition is the exact user, tenant, membership, mobile-session and device
  correlation tuple. `deviceInstanceId` uses M3-1's opaque nodeId validation
  (1–100 characters, containing a non-whitespace character). It is only local
  specimen metadata; the native identifier protocol remains HELD. Case and
  whitespace are preserved. Matching proves neither device possession nor access.
- A read-lease descriptor is synthetic metadata with that partition, lease UUID,
  fictional policy identity, issue time and strictly later finite expiry. It is
  not a bearer credential, sync permission, commercial approval or an issued fact.
- Policy specimen means `mobile-auth-policy-specimen.v1`, `synthetic_demo`,
  `fictional_mobile_auth_policy_v1`, with explicit positive safe-integer
  millisecond bounds for access, refresh, session and reading. Every subordinate
  bound must fit the session bound. There are no defaults and no production policy.
- All pure-contract times are explicit nonnegative safe-integer milliseconds. The
  pure evaluator consults no clock, filesystem, database or native SDK.
- Local metadata means a strict `mobile-local-metadata.v1` partition and positive
  integer local schema version. Only specimen version 1 is understood. A different
  version requires recovery; no migration or physical cold start is claimed.

All object boundaries are strict Zod schemas. `MobileAuthContractError` exposes
only `MOBILE_AUTH_INVALID_INPUT` or `MOBILE_AUTH_POLICY_REQUIRED`; it carries no
Zod issues, raw input, credentials or provider details. Successful credential
parsing returns its input to the explicit internal caller only. Callers must not
log it. The optional persistence adapter is described below; no delivery adapter is introduced.

## Pure read evaluation

`evaluateMobileReadV1` accepts a strict `mobile-read-evaluation.v1` specimen:
explicit policy, expected partition, nullable local metadata and lease, observed
authority (`valid`, `expired`, `revoked`), reconnect requirement, and clock status.
`trusted_fixture` is a fictional test observation, never a real device clock
assessment. `unverified` or `anomaly` requires reconnect without a grace period.
Production clock rollback, skew and reboot policy remains HELD under Q2.

Outcomes are `valid`, `expired`, `revoked`, `wrong_partition`,
`reconnect_required`, `cleanup_required` or `recovery_required`. Only `valid`
has `canRead: true`, and every result retains `synthetic_demo`. Invalid inputs
produce `recovery_required`, never an exception containing input. Missing local
metadata requires cleanup. A mismatched local/lease partition denies access.
Current observed revocation/expiry denies access. Incompatible local metadata
or unsupported policy requires recovery. Reconnect, a missing lease, an overlong
lease, an unverified clock or a time before issue denies reading. At exactly
`expiresAtMs` reading is expired. No local result can overrule server refusal.
These decisions do not enforce file access or prove current server authority.

## Pure cleanup planning

`planMobileCleanupV1` accepts strict `mobile-cleanup.v1` metadata: partition,
`logout` or `tenant_switch`, and unsynced work (`none`, `present`, `unknown`).
It lists partition-scoped obligations for secure keys, database cache, media
cache and sensitive pending content. It performs no cleanup and returns no
deletion instructions. `present` and `unknown` return `policy_hold`; `none`
returns `cleanup_required`, which still requires a native implementation and
policy review. Server revocation scope remains `policy_required` in every plan.
No unsynced-work disposal rule is selected. Invalid cleanup input yields the
bounded contract error and no plan.

## DARK server seam

`SyntheticMobileAuthApplication` in the API identity entrypoint is an opt-in fake,
not an implementation of a public native transport. It is not composed in Nest,
Next, workers, sync or the principal bridge. Every operation refuses unless server
options explicitly set both `enabled: true` and `environment: synthetic_demo`,
and the source is the existing memory AuthProvider. Missing options default off;
production and pilot remain refused even with the switch on. Options are copied
and frozen. D08 has no approved branch or fallback policy.

The internal caller supplies source-session credentials on **every** operation.
The existing principal bridge checks session, current membership, origin and CSRF;
mobile tokens do not replace that bridge or authorize business commands. This is
intentionally a stricter fixture seam, not a proposed native wire protocol. The
persisted provider's SSO/session authority remains unchanged and cannot be used
by this fake. Live session/SSO integration needs its own persistence/transport work.

Strict server inputs extend, rather than change, the existing pure selectors:

- Exchange: `mobile-exchange.v1`, requested tenant, command UUID and opaque device
  instance ID. The envelope and selector must agree. It registers the scoped
  device and returns distinct access/refresh specimens, partition and read lease.
- Rotation: `mobile-rotation.v1`, command UUID, device instance and a
  `mobile-refresh.v1` specimen. A successful rotation consumes the previous
  refresh, replaces access/refresh credentials, and renews the lease. Reusing a
  consumed refresh revokes its entire family, including replacement access,
  refresh and server lease. Concurrent duplicates have at most one success and
  leave its family revoked. A lost response requires fresh exchange; replacement
  plaintext is not cached or recoverable. These are fictional fixture semantics,
  subject to D08 approval before any real transport is built.
- Reconnect: `mobile-reconnect.v1`, device instance and a `mobile-access.v1`
  specimen. Rechecks source session, current membership, partition and family
  expiry/revocation before renewing the lease. Refresh cannot stand in for access.
- Device action: `mobile-device-command.v1`, command UUID, device instance,
  requested tenant and `logout`, `revoke` or `tenant_switch`. Only switching
  requires `nextTenantId`, which must differ and pass current membership checks.
  Switching returns a new target partition and revokes all old-tenant families
  for that user's device. Failure to authorize the target leaves the old family
  intact. Logout/revoke ends every tenant family for that user/device and records
  an all-tenant tombstone, including tenants not yet registered. Other users and
  devices are preserved. A caller cannot select a tenant they cannot access.

Commands are scoped to the authenticated user and keyed by UUID. An identical
repeat returns `MOBILE_REPLAY`; a changed payload returns
`MOBILE_COMMAND_CONFLICT`. Neither returns cached bearer credentials. Refresh
reuse is detected before the command replay check and always revokes the family.
Device revocation/logout records are tombstones even when they arrive before
registration; later exchange cannot resurrect that user/tenant/device instance.
A new synthetic device instance is required after logout or switching back.
The real re-enrolment and unsynced-work policy is still D08 work.

Maps contain device metadata, token **digests**, consumed-refresh digests, command
hashes, family expiry/revocation and bounded lease metadata. They never retain
source-session tokens, CSRF tokens or plaintext mobile tokens. State and source
references use ECMAScript private fields so serializing the service reveals no
credentials. Fixture inspection exposes partition/expiry/revocation metadata,
not token digests or bearer credentials; it must not be logged as an audit event.
There are no logs, sync writes, audit payloads or external actions in this seam.
All errors expose only bounded classifications and discard raw input/provider
errors. Credentials are returned only to the direct internal caller on issuance.

Without a store, transitions serialize within one fake instance. With the optional
PostgreSQL store they serialize across instances under a database row lock. Expiry uses exact safe-integer
milliseconds, is exclusive at the boundary, and rotation cannot extend the
original session deadline. Lease renewal is capped by that same deadline.
Revocation cuts off the server-side lease. A disconnected copy remains readable
only according to its previously issued bound; instant remote erasure is not
promised. The existing pure evaluator still requires reconnect after untrusted
clock observations and refuses at exact lease expiry.

## Remaining implementation and release gates

M3-2-store adds `PostgresSyntheticMobileAuthStore` and migration 0482. The
optional internal adapter persists versioned device records/tombstones, family
and lease metadata, current/consumed credential digests and command claims in
`identity.mobile_auth_fixture_state`. It is a restricted identity control-plane
exception: only the identity role has SELECT/INSERT/UPDATE, with no business or
worker access. The synthetic MemoryAuthProvider identities intentionally have
no foreign keys to real persisted users. This is not a business-data/RLS store.
The strict Zod snapshot rejects incompatible stored versions; failure denies
access without resetting state. No bearer credential is persisted or recovered.

One coarse row lock serializes the entire synthetic state while source checks,
rotation and revocation run. A whole snapshot is deliberate for this unregistered
fixture seam: it reuses the existing transition engine and keeps claims, consumed
history and tombstones atomic without duplicating security logic in SQL. It is
not a scalable or approved production identity design. A denied replay commits
its revocation before returning the error; other failed operations restore the
pre-command state. Lost commit acknowledgements return no credentials; retrying
a possibly consumed refresh revokes its family. No plaintext response is cached.
Fresh instances reload the same committed state and cannot resurrect consumed
credentials or revoked devices. The memory-only default still loses its state.
Fixture inspection remains synchronous and instance-local, never an authority.

PostgreSQL concurrency, upgrade and privilege tests are provided for CI; they
were not executed in the builder sandbox. Native cold start/cache inheritance
and extracted-file encryption still need physical-device evidence. There is no
persisted source provider integration, audit chain or production token storage.

D08 is proposed. Real-data durations, clock policy, rotation recovery/reuse,
revocation scope, re-enrolment and unsynced-work handling remain unapproved.
Auth.js integration, persisted source/SSO preservation, production refresh/device/lease
records with audit, native transport, secure storage, encryption, actual local
migration/cleanup, device builds, PowerSync and G3 require separate evidence.
