# M3-2 mobile authentication contract — named partial

Status: synthetic contract and pure lifecycle decisions only; check lane AMBER.
No mobile credential is issued, authenticated, rotated, stored or revoked here.
Aggregate M3-2, G3 and the existing downstream dependency edges remain HELD.

The inspected main is 87805c86681609273872621ce913c0d6a0b1ebb6, including
M3-1's `offline-contract-v1.md`. That contract freezes an offline intent, not a
native authentication protocol, device attestation or a device identifier format.
The issued no-migration limit and Q6 keep the repository/provider/application
portion HELD. Existing persisted authentication and its sole principal bridge
remain authoritative and unchanged.

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
- All times are explicit nonnegative safe-integer milliseconds. No wall clock,
  network, filesystem, key storage, database or native SDK is consulted here.
- Local metadata means a strict `mobile-local-metadata.v1` partition and positive
  integer local schema version. Only specimen version 1 is understood. A different
  version requires recovery; no migration or physical cold start is claimed.

All object boundaries are strict Zod schemas. `MobileAuthContractError` exposes
only `MOBILE_AUTH_INVALID_INPUT` or `MOBILE_AUTH_POLICY_REQUIRED`; it carries no
Zod issues, raw input, credentials or provider details. Successful credential
parsing returns its input to the explicit internal caller only. Callers must not
log it. No persistence or delivery adapter is introduced.

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

## Held implementation

Durable exchange, access/membership revalidation, source/SSO preservation,
atomic refresh and rollback, lost-response/reuse policy, revocation and lease
issuance require the checked persistence path and reviewed capability inventory.
No in-memory substitute is supplied. No new database object, grant, route,
AuthProvider, application factory, context constructor or external action exists.
Owner creation/removal/recovery authority is unchanged.

D08 is proposed. Real-data lease/session durations, clock policy, rotation
recovery/reuse, revocation scope and unsynced-work handling remain HELD.
Native transport, secure storage, encryption, actual local migration/cleanup,
device builds, PowerSync and G3 require separate evidence. A disconnected device
cannot discover a new revocation instantly; no immediate remote erasure is promised.
