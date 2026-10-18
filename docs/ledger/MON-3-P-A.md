# MON-3-P-A — all-key checking and private durable claims

RED; issued 18 October 2026. Scope A only. MON-3 remains OPEN. Builder work is not independent review or acceptance.

| Assertion | Evidence |
| --- | --- |
| KEY-01/02/03; stable encoding, incomplete fallback, no mutation, key-order independence | `packages/core/src/free-first-job-keys.test.ts`: five failing-first tests; targeted old/new suite passes 16 tests |
| Both claims, either collision, completeness/provenance, replay, changed snapshot, composite links | `packages/db/test/free-first-job-keys.integration.test.ts`; authored, PostgreSQL NOT RUN |
| Actual RLS/ownership/ACLs, private helpers, context refusal, immutable storage, redacted collision | `packages/db/test/free-first-job-keys-security.integration.test.ts`; authored, NOT RUN |
| ATOMIC-01: cross-tenant overlap, one winner, no orphan/partial batch, explicit rollback and caught failure | `packages/db/test/free-first-job-keys-races.integration.test.ts`; authored, NOT RUN; command/audit counts unchanged by claims |
| UPGRADE-01: populated predecessors, own migration alone, named-column/type/PK comparison, later migrations twice, damage controls | `packages/db/test/free-first-job-keys-upgrade.integration.test.ts`; unchanged `upgrade-proof-utils.ts`; authored, NOT RUN |
| Catalog inventories preserve existing expectations | Exactly two additive entries in each existing RLS/owner inventory in `tenancy.integration.test.ts` |
| No runtime exposure | Migration 0192 has no non-owner table/helper grants; no API/barrel/schema/composition change |

Migration: `0192_free_first_job_keys.sql`, with standalone migration note. Expand-only, no backfill; installation rollback then preserve claims and fix forward. Legacy key bytes and old helper remain compatible. No new operational alert or external action.

Remaining B/C acceptance: verified business/card persistence and eligibility, first/second checked activation, bypass protection, current authorization and command replay, command/receipt/audit atomicity, London clock/DST, immutable authoritative ends, MON-2A-P conversion/corrections, actual Final Check/illustration parity. These are not demonstrated by A's isolated synthetic activation parents or storage tests. MON-3 does not close on this foundation.

STOP items (affected behavior only; unchanged before/after):

- `apps/api/src/free-first-job.application.ts:16`: before uncomposed read port; after unchanged. Runtime admission awaits B/C and actual MON-2A-P/CH-4 interfaces; no substitute interface invented.
- `packages/core/src/free-first-job.ts:21`: before elapsed-day reference preview; after unchanged. No persisted clock/conversion or unresolved DST entitlement decision enabled in A.
- `docs/contracts/free-first-job-keys-v1.md:11`: before no replacement/merge authority; after explicitly held. If all verified keys change, no continuity/reset rule can be inferred from dual-key claims.

D01/D02/D03/D08/D09/D16 remain closed. No real identity/card/provider data, sending, collection, release, retention/deletion policy or new access power. Independent RED verdict must bind the dispatcher-created commit, followed by separate acceptance. Ben retains push/merge/release.

Verification handoff: typecheck, package lint, isolated build retry, OpenAPI comparison, targeted core tests, tool tests and web unit tests pass. Official lane lint is held until a non-self commit range exists. Broad core/API regressions are not green (unchanged allocator timeouts and sandbox HTTP failures/incomplete API run); see the builder receipt for exact commands and retries. PostgreSQL acceptance and independent RED review remain outstanding.
