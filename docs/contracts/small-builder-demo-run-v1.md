# DEMO-S / DEMO-I run lifecycle v1 (RED)

Backend groundwork, 28 October 2026. This supersedes the earlier request-shape-only preparation. The chooser, HTTP/browser transports and journeys J1–J5 are outside this piece. No completed journey or product acceptance is asserted.

`SmallBuilderDemoApplication.execute(credentials, operation, runId, input)` uses the existing MON-2A signed-in company authority port (`subscriptionAuthority(identity)`). It resolves the real email-code session, selected company membership, Origin and CSRF anew on every call. A practice cookie cannot substitute for company authority. Compose it with `SmallBuilderDemoRepository(pool)`; the repository rechecks the persisted session in PostgreSQL through `mon1_company_actor`. No new authentication or fictional company bootstrap is invented.

| Operation | Input | Result |
| --- | --- | --- |
| create | null run ID; `small-builder-demo.create.v1`, commandId, scenario | Stored blocked run attempt with plain reason |
| read / resume | exact run ID; empty object | Current saved lifecycle state; no write |
| reset | exact run ID; `small-builder-demo.reset.v1`, commandId, expectedRunRevision | Archived predecessor and successor ID |
| snapshot | exact run ID; `small-builder-demo.report-snapshot.v1`, commandId, expectedRunRevision | Immutable report snapshot of lifecycle facts |
| report | exact run ID; empty object or snapshotId | Existing latest or exact snapshot; no implicit creation |

Strict Zod schemas are shared from the database package and re-exported by the existing API contracts module. SQL independently rejects extra command keys. No client-provided authority, hidden selector, source vector, completion, money, trial entitlement or business outcome is accepted.

All five families currently refuse execution: core awaits journey/correction bindings; recovery awaits its journey/collection/refund bindings; shadow awaits Final Check journey/attribution bindings; meter awaits profile execution/clock bindings; trial awaits journey/identity/clock bindings. Create persists the selection and refusal, rather than pretending to start domain work. Resume returns that persisted reason. J1–J5 must introduce accepted executable producer contracts in later changes; this piece has no execution-enabling switch or generic step/checkpoint writer.

Runs have tenant-qualified keys, creator membership. The signed-in company must be synthetic and the database must be `jobguard_synthetic_demo`. Runtime has no direct read/write table grants; the controlled routine checks authority before reads or receipt replay, including after waiting on the company lock. Ownership is the company and membership returned by `mon1_company_actor`, independent of the login session. A fresh valid sign-in for that same user/company can resume the run, read its snapshots and replay its commands; another user or company cannot. Session digests authenticate each request and are not stored as run or receipt ownership. RLS is forced and restricted to the migration-owned routine under transaction-local tenant context. These controls do not protect against stolen privileged database credentials.

Commands use durable per-company IDs. Reusing an ID with different input, operation, run or owner membership fails. Reset serializes with snapshots, increments predecessor revision from 1 to 2 and creates exactly one successor with revision 1. The original reset command replays its stored result; a different stale reset fails. No deletion, business cancellation, company replacement, meter exclusion, key release or billing rewrite occurs. Archived runs and their immutable snapshots remain readable with current owning-company membership authority.

Reports contain only persisted run ID, scenario, reason, lifecycle revision/status, timestamps and predecessor/successor IDs at snapshot time. They are lifecycle reports, not P2 product/source reports. There are no prices, hidden signals, claimed settled facts, external-action counts, source hashes or PASS claims. Snapshot and reset are audited transactionally with request/result hashes; the audit head is the final contending lock. GET-like reads never create reports or receipts. No external provider is called.

Migration 0313 is additive, automatically discovered by the existing numbered migration loader. See `packages/db/migration-notes/0313_small_builder_demo_runs.md` for isolation, CI suites and forward-fix notes. No production policy or release gate is changed.
