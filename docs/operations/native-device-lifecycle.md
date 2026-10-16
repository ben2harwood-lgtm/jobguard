# Native device lifecycle — M3-2 partial preparation

This note describes obligations, not an installed native implementation.
Only synthetic pure contract/lifecycle tests exist in this piece. D08 remains
proposed; aggregate M3-2 and G3 remain HELD. No new provider route or data flow
is activated and no operational alert is introduced.

A disconnected device cannot learn a newly recorded revocation instantly.
A future approved finite read lease and reconnect authorization checks must
bound access. Reconnect must recheck source session, membership, contractor
revocation and applicable SSO scope before renewal. Neither a cached role,
device identifier, clock, partition nor lease can restore authority refused
by the server. This piece does not issue a lease or implement that check.
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
remain policy questions. This piece revokes no existing source or mobile session.

Before release, obtain actual supported iOS/Android development/release builds,
key-store/encrypted SQLite/media settings, extracted-file inspection, credential
non-disclosure, restart/local-migration tests, partition isolation and cleanup
evidence. Test fresh-instance durable rotation/revocation with real PostgreSQL
after the checked identity capability path is authorized. Resolve lost-response
and refresh-reuse policy without restoring consumed credentials or claiming
recovery of unavailable replacement values. Keep device encryption, native
transport, download authorization, queue/upload work and G3 within their own
issued tasks and gates.
