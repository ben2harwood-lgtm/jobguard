# Native chaos matrix — v1 (M3-7 server preparation)

Status: server test specification; physical-device evidence is blank. This suite is
not the G3 device journey. G3 is not met. There is no native app in this repository
(`apps/api` and `apps/web` only). G0–G5 remain closed for this work; nothing is live.
Only fictional sessions, members, media and in-database synthetic transfer are used.

## Expected server outcomes

Paths below are relative to `packages/db/test/`. Existing assertions are cited
rather than copied into another test. No cited PostgreSQL test was executed in
this sandbox; a passing CI run at the reviewed head is still required.

| Failure | Expected outcome | Automated coverage |
| --- | --- | --- |
| Duplicate command upload / reconnect | One receipt and work-state effect; same identity with changed payload returns `IDEMPOTENCY_CONFLICT`; no outbound or money effect | `offline-upload.integration.test.ts`: “DARK upload persists once across reconnects, concurrent retries and a fresh pool; changed payload conflicts” |
| Duplicate evidence chunk / finalize | Exact chunk retries resume at the stored offset; one immutable original/version; changed bytes return `CONFLICT`, changed finalization type returns `COMMAND_CONFLICT` | `evidence.integration.test.ts`, dark resumable evidence: “persists interruption, rejects pending proof, resumes and finalizes one server-verified original” and “refuses tenant/job substitution and changed replay bytes; chunks enforce real RLS and grants” |
| Wrong-tenant token / job | Session scoped to another job or tenant is refused with `PERMISSION_REVOKED`; foreign transfer context returns `NOT_FOUND`, no chunk visibility | `offline-upload.integration.test.ts`: “DARK upload preserves cancellation lineage and refuses stale completion, cross-session jobs and revoked membership”; `evidence.integration.test.ts`: “refuses tenant/job substitution and changed replay bytes; chunks enforce real RLS and grants” |
| Membership revoked while offline | Reconnect refuses status, append and finalize with `NOT_FOUND`; previously acknowledged command replay returns `PERMISSION_REVOKED`; pending upload remains pending, no additional evidence/receipt/outbox/money effect | `native-server-chaos.integration.test.ts`: “offline membership revocation refuses state, remaining bytes, finalization and command replay without effects” |
| Clock skew | Past/future capture time remains labelled client metadata; server receive/verify time and hash govern proof; expiry capped at 24 server hours; expired append returns `CONFLICT`, expired finalize returns `UPLOAD_EXPIRED` | `native-server-chaos.integration.test.ts`: “clock skew … remains labelled metadata and cannot extend server expiry” (1970 and 2099) |
| Schema upgrade / incompatible queued format | Unsupported command envelope/body returns `INVALID_OFFLINE_UPLOAD`; transfer v2 returns `ZodError`; pending v1 bytes survive; supported v1 resumes and commits once with no outbound action | `native-server-chaos.integration.test.ts`: “schema upgrade refuses unknown envelopes without consuming pending bytes or a command identity” |
| Stale approval / revision / price / accepted snapshot | `APPROVAL_EXPIRED`, `STALE_REVISION`, `STALE_PRICE`, `ACCEPTED_VERSION_CHANGED` or `AUTHORITY_CHANGED`, as applicable; even current authority returns `ONLINE_REVIEW_REQUIRED`; no new approval, outbound or money effect | `offline-upload.integration.test.ts`: “DARK commercial uploads use current database authority and never create approval, outbox or money effects” and the cancellation-lineage test above |
| Pending evidence | Incomplete finalize returns `INCOMPLETE`; proof completion returns `PROOF_NOT_FINAL` until server verification | `evidence.integration.test.ts`: “persists interruption, rejects pending proof, resumes and finalizes one server-verified original” |

These are synthetic server membership/session checks, not tests of native bearer
transport, mobile sign-in, sync download authorization or a production token
issuer. Schema coverage proves version refusal and compatible durable resumption;
it does not prove an on-device SQLite upgrade. Existing migration proofs remain
separate. No schema migration is added by M3-7 server preparation.

Run the server evidence together in a PostgreSQL-capable environment, with no
real services or data:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/native-server-chaos.integration.test.ts test/offline-upload.integration.test.ts test/evidence.integration.test.ts
```

This is the required execution follow-up, not a recorded passing run.

## Physical-device execution record (v1)

All device, build, executor, date, evidence and result cells intentionally remain
blank. Supported models/OS/build versions must be selected and recorded by the
release owner; iOS/Android rows are platform obligations, not a support claim.
“Not run” describes the current scenario status, never a passing result.

| Platform obligation | Device/model | OS | App/build | Cache/schema version | Executor | Date | Evidence | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Physical iOS | | | | | | | | |
| Physical Android | | | | | | | | |

| Device scenario | Expected outcome | Current status |
| --- | --- | --- |
| Full field journey on each supported build | Offline capture → app restart → reconnect → confirm proposal → prove work → resolve conflict → server-authorized commercial action, preserving job/scope identity | Not run |
| Corrupted cache | Refuse unsafe local reads/writes, explain recovery, retain unsynced intent for authorized recovery; never overwrite server truth | Not run — device-only |
| App termination / restart / device reboot | Recover encrypted pending media and stable command IDs/offsets without duplicating effects | Not run — device-only |
| Upgrade / resync / restore / downgrade incompatibility | Preserve pending work and partition keys; incompatible store stays closed pending supported recovery | Not run |
| Multi-crew conflicts / skew / duplicate uploads | Explicit conflicts and single semantic effects, no clock-based commercial overwrite | Not run |
| Wrong account / tenant / revoked or expired access | Partition isolation and bounded offline access; separate download and upload checks on reconnect | Not run |
| Encrypted SQLite/media/key-store and extracted-file inspection | Device evidence of encryption, protected keys and no exposed secrets | Not run |
| Lost device / logout / tenant switch with unsynced work | Approved retention/revocation/recovery policy, no promised instantaneous disconnected erasure | Not run |
| Airplane mode / low storage / interrupted upload | Explain pending/conflict state and preserve recoverable user intent | Not run |
| Rollout / rollback and web fallback rehearsal | Safe stop/resume without bypassing authority or silently discarding pending work | Not run |

M3-6 and ENT-12 screens, the native app, physical iOS/Android runs, device encryption
tests, lost-device review, support ownership and G3 stay open for people. No person,
approval, date or result has been supplied here. See
[native device lifecycle](native-device-lifecycle.md) for unresolved policy and
[rollout/rollback](native-rollout-rollback.md) for the gated procedure.
