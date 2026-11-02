# Native device lifecycle — M3-2 partial preparation

This note describes obligations, not an installed native implementation.
Synthetic pure contracts and an opt-in server fake with optional PostgreSQL
state persistence exist in this piece. D08 remains proposed; aggregate M3-2 and G3 remain HELD. No new provider route or data flow
is activated and no operational alert is introduced.

A disconnected device cannot learn a newly recorded revocation instantly.
A future approved finite read lease and reconnect authorization checks must
bound access. Reconnect must recheck source session, membership, contractor
revocation and applicable SSO scope before renewal. Neither a cached role,
device identifier, clock, partition nor lease can restore authority refused
by the server. The DARK server fake issues synthetic leases and performs source
and membership checks through the memory AuthProvider only. Persisted source/SSO
integration remains unbuilt.
No immediate remote erasure or immediate disconnected revocation is promised.

The pure specimen denies reading at the exact lease expiry. Unverified or
anomalous clock observations require reconnect. `trusted_fixture` is test
metadata, not an implementation that detects rollback, skew or reboot.
Production clock handling, durations and grace rules require an approved
versioned policy. The specimens select none of those production values.

Before opening a local store after cold start or account/tenant selection,
the native implementation must bind keys, database, media and pending sensitive
content to the exact user/tenant/membership/session/device partition. A different
partition denies reading; missing metadata requires cleanup; invalid or
incompatible metadata requires recovery. There is no local migration engine
here. Version compatibility must be proven on the supported devices later.

Logout and tenant switch require partition-scoped secure-key, database-cache,
media-cache and pending-content cleanup. The pure plan identifies these
resources and performs no deletion. With present or unknown unsynced work,
the result is `policy_hold`, with no disposal instruction. Even `none` only
returns `cleanup_required`; it proves no erasure. Do not discard unconfirmed
work or promise retained access by interpreting this plan as policy approval.
Revocation scope, disconnected pending revocation and unsynced-work handling
remain policy questions. Logout/revoke invalidates all tenant families for the authenticated user/device;
tenant switch invalidates only the old tenant. Other users/devices are preserved.
The fake invalidates its own mobile families and leases only. It never revokes existing web/source sessions.

Before release, obtain actual supported iOS/Android development/release builds,
key-store/encrypted SQLite/media settings, extracted-file inspection, credential
non-disclosure, restart/local-migration tests, partition isolation and cleanup
evidence. Test fresh-instance durable rotation/revocation with real PostgreSQL
after the checked identity capability path is authorized. Resolve lost-response
and refresh-reuse policy without restoring consumed credentials or claiming
recovery of unavailable replacement values. Keep device encryption, native
transport, download authorization, queue/upload work and G3 within their own
issued tasks and gates.

The server fake is unregistered in every live application and defaults off.
Both an explicit synthetic environment and opt-in flag are required, and only
`MemoryAuthProvider` is accepted. Migration 0520 adds a restricted identity control-plane fixture snapshot, with
SELECT/INSERT/UPDATE only for the identity role and no business/worker access.
No endpoints, keys, providers, external data flows or deployment settings change. Auth.js is missing; no package
was added. There are no new operational alerts because no runtime is activated.

Within a fake instance, refresh is single-use; reuse (including a lost-response
retry) revokes the family and its replacement credentials/lease. Commands do not
cache bearer responses. Logout/revocation tombstones and tenant switches prevent
later registration from restoring the old partition; a new synthetic instance ID
is required to re-enrol. This placeholder is not an approved D08 recovery policy.
Every reconnect rechecks source authentication and membership before lease renewal.
No mobile token can authenticate through the existing web principal bridge.
Without persistence, restart loses fake state and refuses old tokens. With
`PostgresSyntheticMobileAuthStore`, fresh instances reload consumed digests and
revocation tombstones under one coarse transactional row lock. Reuse commits
family revocation even though the operation returns denial. Other command
failures restore their prior snapshot. Stored-version errors fail closed.
This does not prove production restart recovery, audit or native cache erasure.
PostgreSQL concurrency and restart tests are supplied for CI, not executed locally.
Forward fix: disable composition if necessary and add a later migration; preserve
0520 and existing tombstones/history. Do not reset the snapshot to repair an error.

Native file/key erasure and handling of pending work remain obligations above.
Server logout cannot make a disconnected lease disappear; its prior finite expiry
still bounds offline access. Tests use made-up fixtures and execute no real provider.
