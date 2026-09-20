# Synthetic restore rehearsal (JG-C / issue #20)

## Scope

This is an executed **disposable fixture rehearsal**, not a deployed backup service,
G0/G1 approval, an independently checked verdict, or an operational recovery promise.
It uses the current database-backed synthetic evidence store. It does not test MinIO,
S3, hosted database restoration or real customer data.

Source baseline: `ab8e7f2d9d43ac5ec6ff62bff2533b0fa508d404` (main inspected
20 September 2026). Implemented in ChatGPT under Ben's instruction to continue
JobGuard directly. No government repository is touched.

## Run

Use the repository's pinned Node and pnpm, with dependencies installed:

```sh
pnpm test:restore
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/restore-rehearsal.integration.test.ts
```

The first command builds the existing database/core/storage packages, then runs the
CLI. After that build, JSON-only output is available with:

```sh
node packages/db/tools/synthetic-restore.mjs > synthetic-restore-receipt.json
```

The CLI accepts **no database URL or data-directory argument**, reads no application
credentials, and refuses an explicitly non-synthetic `JOBGUARD_ENV`. Every database,
login, password, job, source artifact and approval is generated in its own temporary
fixture. Both servers listen on loopback at dynamically selected ports. Passing an
existing database/path in the programmatic options is rejected, not interpreted as
a target. Only the function's newly created temporary tree is removed at cleanup.

## What happens

The rehearsal creates a fresh PostgreSQL 16 cluster and applies every migration.
It seeds two fictional tenants and a reviewed source snapshot, then uses the actual
EvidenceService, ProofCommandService, CustomerBillingCommandService and outbox
interfaces. A real synthetic £120 invoice and £50 manual receipt leave £70 due.
The invoice bytes and receipt cannot become recovery or platform-settlement proof.
Three separate fake actions are pending, outcome-unknown and already completed.

The harness records row counts and row-content hashes for **all** application,
identity, control, infrastructure and migration tables, plus an audit checkpoint
outside the copied cluster. It closes database clients and cleanly shuts down the
source server **before** copying its whole data directory, including WAL. It checks
every regular file by SHA-256, refuses symlinks/external tablespace paths, preserves
file ownership/permissions, archives the original offline, and restores a separate
copy at a different port. It never labels a live directory copy a valid backup.

The restored server must reproduce every recorded row hash. Additional assertions
verify exact evidence key/version/bytes, invoice PDF hash and balance, idempotent
manual-receipt replay, the audit chain/checkpoint, runtime permissions, forced RLS,
cross-tenant download denial and a tenant-scoped export slice. Orphan cleanup with a
future fixture clock must leave retained evidence intact.

A rehearsal-only dispatch wrapper starts paused. An attempted dispatch must fail
without changing queued work. After all restore checks, the harness permits only
its in-process fake adapter: concurrent/repeated attempts produce one effect for
pending work, completed actions are not resent, and unknown outcomes cannot be
blindly retried. Unknown reconciliation stays unknown.

## Negative controls and interpretation

The suite deliberately attempts a running-cluster copy and corrupts one file in a
disposable backup. Both must be rejected. It also rejects non-synthetic modes and
connection/path options; detects a changed audit payload; denies foreign-tenant
access and runtime job mutation; and tests paused/unknown dispatch refusal.

`PASS` refers only to the enumerated fixture checks. Timings are measured local run
durations, not production recovery objectives. SHA-256/checkpoints show consistency
against this run's recorded expectations; they are not an external signature or
proof of an uncompromised administrator. A cold copy needs the same compatible
server/platform; no cross-version restore or online point-in-time recovery is shown.

The row snapshot includes empty tables as well as seeded tables. This does not
exercise every domain workflow merely because every table is fingerprinted.
The source final-account snapshot is a generated database fixture, not a completed
capture-to-invoice browser journey.

## Explicit remaining work

The receipt retains NOT RUN items for hosted backup/restore/PITR, MinIO/S3 restoration,
a global application outbound kill switch with independently authorized unpause,
the full privacy/export/deletion/retention/legal-hold workflow, physical devices,
and independent review/founder release. The small export is only a synthetic
job/evidence-reference slice; it is not a general legal data-export implementation.
The local dispatch wrapper must not be represented as a deployed kill switch.
Do not close #20 as fully independently accepted on these tests alone.

No migration, grant, business formula, production feature flag or provider was
changed. Existing tests/security gates remain mandatory. The new integration test
is automatically collected by the existing database suite; the CLI is also runnable
separately. No new package dependency is introduced.

## Source

PostgreSQL 16, “File System Level Backup”, section 26.2:
https://www.postgresql.org/docs/16/backup-file.html
The documented stopped-whole-cluster method is the basis for this fixture. It does
not establish that the hosted deployment uses or supports this procedure.

## Integrated candidate evidence

The rehearsal is delivered as a draft stacked on the workspace repair (PR #71,
`a1be6fcccdf4cddf809b8fc7cfbfd0ee083a1457`), not on the old main branch.
The original main-baseline result is retained in the receipt provenance.
On this integrated source, pinned local typecheck, lane lint, ordinary tests,
migration tests, production build and CLI restore all passed. The production
browser suite then passed 130/130 tests in both mobile and desktop projects.
The complete command took 268.48 seconds; caching is visible in its run log.
The JSON receipt contains this integrated run's actual migration inventory,
file/row counts, hashes and measured timings. Remote CI and independent review
remain separate evidence. No main merge or deployed recovery promise is implied.
