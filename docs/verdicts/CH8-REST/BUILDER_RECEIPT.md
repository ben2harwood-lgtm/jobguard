# CH-8 part 2 — RED, preparation with runtime refusal

Plan piece: finish-list row 11, BUILD_PLAN.md §10.4 CH-8, evidence packs with lock and reveal.
Base: codex/sandbox/ch8-v-catchup (PR #381); branch: codex/sandbox/ch8-rest.

This piece adds synthetic worker requests, eight-section database material, checked immutable storage,
worker-only must-surface completion receipts, exact-hash attachment approval, an additive UI and offline
verifier dispatch. Migration 0306 is expand-only; it does not change existing shadow-table grants.
The infrastructure request table is a reviewed-design infrastructure exception carrying identifiers,
request time and completion time only; tenant payloads/digests remain private tenant business rows.

The queue is necessary to keep the runtime login unable to read hidden material or invoke the checked
writer. SQL pins the order-time pre-lock state, reauthenticates after waits, and compares the current
server inventory before storing content or an approval. Content stays exact PostgreSQL row JSON text,
including original base64 bytes where stored, microsecond strings and rational strings. Record version
and object version labels are record-content hashes, not assertions about an S3 object version. Source
record contents retain the original immutable object version identifiers. Sections absent upstream
remain explicitly absent. Stored approval records do not claim continued source freshness or permit
legacy message attachment sinks to consume v3 IDs.

## Router scope decision, 28 October 2026

Part 2 is ready as preparatory implementation. The fresh shadow-30000 source-to-settlement/UI/verifier
journey is explicitly CH-8 part 3, after codex/sandbox/sv6-hookup supplies runtime attribution.
It is not built or claimed here. The public SV-6 assessment command still refuses on this base.

Consequently v3 generation and approval now refuse with EVIDENCE_PACK_V3_DEPENDENCY_HELD at the
authenticated application boundary, before queue dispatch. The SQL request routine also refuses, and
the checked writer independently refuses even owner-seeded stale queued work after reauthentication.
No pack with absent or invented attribution/settlement can be created through these runtime paths.
Pure assembly specimens and source preparation remain available for construction; they are not
persisted runtime packs. v1 behaviour remains supported. Database refusal regressions are for CI.

Independent RED review and GitHub database/browser validation remain required. These changes overlap
part 1; preserve its dependency/merge order and both sides of shared expectation lists.

## Checks actually executed

- Node 24.17.0, installed Vitest 4.1.12, explicit maxWorkers=2, at most three named files per run.
- Core evidence-pack-v3, evidence-pack-v3-assembly, evidence-pack: 99 tests passed.
- API evidence-pack-v3.application, evidence-pack-v3.worker, evidence-pack.application: 34 tests passed.
- Installed TypeScript checks for core, db, api and web passed.
- Money arithmetic and commercial-boundary checks passed.
- CLI syntax check passed with node --check. CLI subprocess tests: 5 passed, including v3 dispatch.
- Controller/errors focused run: 18 passed after updating the stale producer double.
- git diff --check passed.
- Root lint did not pass: the lane comparison against main includes inherited PR #381 paths,
  including its separate lane registration. This lane lists only this piece's actual changed paths.
  The router must preserve the stacked dependency/merge order; no check or predecessor lane was weakened.
- Controller/errors focused run initially found a stale held-producer test; its producer double was
  updated to exercise an actual queued dependency failure instead of relying on removed application refusal.
- PostgreSQL/migration/browser suites were not run: this sandbox cannot start PostgreSQL or bind localhost.
- The first API test attempt failed because storage dist had not been built. Building installed local
  storage/config/AI dependencies fixed it; the same three named API files then passed.
- The pnpm shim stalled while attempting its pinned-manager handoff, so checks use the existing
  node_modules/.bin/tsc and per-package node_modules/.bin/vitest. No packages were installed/downloaded.

## Initial review simplification

LATER / SIMPLICITY — packages/db/src/evidence-pack-v3-sources.ts and evidence-pack-v3-ports.ts:
after the queued source path is accepted and all consumers migrate, retire the separate held preparation
path. One source/authority path would reduce duplicate contracts and maintenance. This does not block.

## Follow-up fail-closed verification

The router-scoped follow-up adds application and independent SQL refusal fences. The targeted API
application/controller tests verify HTTP 409, no queue or writer calls, authentication first and v1
compatibility. Pre-lock and post-lock PostgreSQL regressions now assert no v3 artifact or approval
can be persisted while the runtime hookup is unavailable; those suites remain for CI.

Follow-up results: 32 tests passed across evidence-pack-v3.application.test.ts,
evidence-pack-v3.controller.test.ts and evidence-pack.application.test.ts with maxWorkers=2.
Core/db TypeScript builds and API TypeScript no-emit check passed. git diff --check passed.
No unresolved merge paths or conflict markers were found. No DB/browser suite was run locally.
