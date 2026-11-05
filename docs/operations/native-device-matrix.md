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

## M3-7-SUITE scripted matrix v1 (synthetic, device-free)

`packages/core/src/native-chaos.test.ts` scripts unknown-outcome restart/replay,
clock jumps with refusal/retry retention, incompatible saved versions, and a
129-entry backlog with a poison job. It calls the existing queue/reconciliation
reducers; response fixtures are not server proof or durable storage.

`packages/db/test/native-server-chaos.integration.test.ts` joins these reducers to
the real upload application and PostgreSQL services. Airplane mode cuts delivery
before the command; app kill loses the acknowledgment after commit; duplicate
replay submits concurrent copies. Each resumes a partial media upload with a fresh
service, refuses incomplete/changed chunks, finalizes one evidence object, observes
revision 1 with its audit reference, and refuses a new stale command without
changing revision or audit. The backlog selects an unrelated job past a blocked
job, then asserts that job's single effect and stale refusal. Existing schema,
clock-skew and revocation scenarios now inspect persisted revisions and audit;
revocation refuses both a previously committed replay and a never-submitted
intent, retaining the refusal in reconciliation. These are in-process server
calls, not a network outage, OS process kill, bearer-token or device test.

“Full queue” here means a 129-entry fixture, not a product capacity policy. The
pure queue defines no capacity limit. Disk-full rejection, durable enqueue and
native retry scheduling remain device obligations; refused entries and their
original bodies must be retained by the eventual encrypted store.

## Physical-device checklist v1 — all unchecked, not executed

Repeat each on supported physical iOS and Android development builds with only
fictional data. Record exact build/OS/store schema, executor/date, command/job/scope
IDs, server revision, receipt/audit references, refusal codes and evidence links in
the execution record above. Keep secrets/media out of test logs.

- [ ] Airplane mode mid-upload: capture voice/photo, interrupt after a partial
  chunk, attempt proof while pending (refused), reconnect, resume original upload
  offset/ID, verify one immutable original/hash and one intended command effect.
  Retry changed chunk bytes and confirm refusal with unchanged server revision/audit.
- [ ] Kill and restart: force-stop during upload and again after server commit
  before acknowledgment is saved; reboot too. Recover encrypted media/body and the
  same command/hash/revision, replay once, inspect one receipt/effect/audit event;
  a new stale command is refused without new effects. Do not uninstall to repair.
- [ ] Clock skew: move device time backward and forward, capture and reconnect.
  Check labelled capture metadata, server receive/verify times and server expiry;
  expired upload/approval is refused, with no revision/audit change from refusal.
- [ ] Duplicate replay: reconnect two fictional crew devices and replay original
  commands/chunks concurrently; expect one semantic effect. Change content under
  the same ID and verify explicit conflict, unchanged audit and no outbound action.
- [ ] Schema upgrade: save pending capture/intent, upgrade the encrypted local
  schema/app, resync and restore. Preserve identities and unsynced work; unsupported
  versions/cache corruption fail closed. Retry supported original format and
  inspect server revision/audit; rehearse incompatible downgrade without data loss.
- [ ] Membership revoked while offline: queue unsent work, revoke access online,
  reconnect and replay committed and uncommitted IDs. Check upload refusal before
  replay, separate download denial, local cleanup/lease policy and refusal UI;
  no new command/evidence/audit effect. Offline instant erasure is not promised.
- [ ] Full queue/low storage: fill the native queue to its approved capacity and
  exhaust media storage. Explain refused capture, preserve all existing encrypted
  work, restart, free space safely and drain safe jobs past a poison job. No lost
  IDs or silent discard; server revision/audit increments only for accepted work,
  stale/refused work has no effect. Record actual capacity, not this fixture size.
- [ ] Run the complete field journey, wrong-tenant/account, stale approval,
  multi-crew conflict, lost-device/logout and web-fallback/rollback rows above;
  obtain encryption, independent sync authorization and support-owner evidence.

## M3-7-SUITE builder handoff — READY (5 Nov 2026)

READY for router commit on `codex/sandbox/m3-7-suite`, NOPR, RED: offline commands.
This is additive device-free test groundwork on M3-4 reconciliation, not completion
of M3-7. Only the new pure test, expanded server test, this matrix and the lane file
were edited in this session. No runtime behavior, provider, dependency, database
schema, grant, stored format or commercial policy was changed by this piece.

Local evidence (installed workspace executables, no package downloads):

- From `packages/core`: `./node_modules/.bin/vitest run --maxWorkers=2
  src/native-chaos.test.ts src/offline-client-queue.test.ts
  src/offline-reconciliation.test.ts` — 3 files, 78 tests passed.
- From `packages/core`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — passed.
  Root TypeScript compiler API typechecked the expanded integration source and its
  imports with root strict options and `noEmit: true` — zero diagnostics. This is
  static source checking, not execution of any server assertion.
- Direct `./node_modules/.bin/tsc -p packages/<name>/tsconfig.json` builds for core,
  config, storage, db and ai passed. These generated ignored dist prerequisites;
  the API guard initially could not resolve missing db/config, then ai exports.
  No import guards were changed. A broad root typecheck was stopped without a
  result; no full-workspace typecheck success is claimed.
- From `apps/api`: context-boundary and identity tests passed, 152 tests total;
  watchdog-registry passed on its final focused run, 126 tests. Initial guard runs
  failed at import time before the missing dist prerequisites were built.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1
  test/migration-proof-loader.test.ts` — 76 tests passed. No PostgreSQL started.
- `git diff --check` — passed. `LANE_BASE_REF=codex/sandbox/m3-4-reconcile node
  tools/agent-lane-boundary-lint.mjs` — failed only on inherited other-lane files
  named below; this is an open hold, not a lane PASS.
- The installed global `pnpm --version` shim attempted pinned-version resolution
  and failed offline signature/registry verification. Checks above used existing
  workspace TypeScript/Vitest binaries instead; no package was installed.

### Named holds for landing

- **Inherited lane divergence:** current starting head `6cfc91196` already differs
  from `codex/sandbox/m3-4-reconcile` at `94a30eeed` in unrelated merchant-order and
  dashboard changes, including `config/lanes/batch-26.json` and
  `config/lanes/ent-dashboard-slow.json`. The exact union of non-lane changed paths
  is listed in `m3-7-suite.json`, as ordered. The boundary checker refuses these
  two inherited lane edits. Router must reconcile the landing base/branch history
  under existing lane ownership before landing; no broad lane exception was added.
  Inherited migration 0606 is not introduced by M3-7-SUITE and remains subject to
  the router's existing migration ordering at landing.
- **PostgreSQL and CI:** no database or browser execution here. At the exact
  committed candidate, CI must execute the expanded native-server-chaos suite,
  offline-upload and evidence integration suites (the three-file command above),
  and all mandatory DB/migration/RLS/privilege/audit/replay tests. It must prove
  durable resumption, revision/audit immutability on refusals, unique effects and
  membership checks using PostgreSQL, plus full typecheck/lint/build/tests and
  existing web journeys against current main. Compilation is not database proof.
- **Independent RED review:** arrange one different reviewer/session at the exact
  committed head, using CI evidence and any uncovered focused checks. This builder
  handoff is not independent review, acceptance, merge or release approval.
- **Native acceptance:** actual encrypted store/queue durability, physical-device
  checklist, M3-6/ENT-12 dependency acceptance, independent download/upload proof,
  lease/revocation bounds, migration/restore safety, support ownership and rollout
  rehearsal remain open. D08 is not approved and G3 stays closed. No real data,
  live service, deployment or launch is authorized; M3-7 is unfinished.


## Batch-47 landing catch-up — READY (5 Nov 2026)

Reconciled the working tree with incoming main `d16ef1978` (PR #574).
Kept main's rate-baseline export alongside this group's offline-reconciliation
and core-loop-views exports. No migration, routine, migration-proof or exact
catalog-list difference remains against that main; inherited batch-30 changes
are already on main. The earlier inherited-lane divergence above is historical:
`config/lanes/batch-47.json` now exactly lists the 13 non-lane paths in this
group's working-tree diff against incoming main, without listing itself.
No behavior was added by this catch-up and no test was weakened.

Local checks using installed workspace binaries:

- Root `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` — passed.
- From `packages/core`, `./node_modules/.bin/vitest run --maxWorkers=2
  src/offline-reconciliation.test.ts src/offline-reconciliation.properties.test.ts
  src/native-chaos.test.ts` — 3 files, 14 tests passed.
- From `packages/core`, `./node_modules/.bin/vitest run --maxWorkers=2
  src/core-loop-views.test.ts src/offline-client-queue.test.ts
  src/rate-baseline.test.ts` — 3 files, 97 tests passed.
- From `apps/api`, `./node_modules/.bin/vitest run --maxWorkers=2
  src/core-loop-shared.contract.test.ts` — 1 file, 2 tests passed.
- `git diff --check` — passed. Direct path-set comparison against `MERGE_HEAD`
  verified exact lane coverage, no migration delta, no conflict markers in group
  paths, and preservation of every main core export. This is a working-tree
  check, not the post-commit CI lane result.

RED. PostgreSQL/browser suites, full CI and independent review remain required
at the committed head. Physical-device evidence, D08 and G3 remain outstanding.
Git metadata is read-only here: the conflict content is resolved, but the router
must stage it and complete the merge before pushing. No commit or push was made.
