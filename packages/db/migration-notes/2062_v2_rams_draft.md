# 2062 · Q06 V2-K9 RAMS drafts (RED)

Adds only `app.v2_rams_draft`, an append-only snapshot/command history. Each
snapshot records the job, quote/plan revision, effective plan edit version
(`max(expected_version)+1`, zero before edits), document version, sections,
builder edits, status and server-selected actor/time. Signed snapshots are
never updated: edits after signing and regeneration append a new document
version. No prices, AI calls, sending, charges or certification are introduced.

The V2 bootstrap applies this after 2001–2004, only in `jobguard_v2_local` with
the existing `v2_practice_firm` policy. Shared migration installation outside
that boundary changes nothing; the empty proof describes that no-op. The
existing purchase-order-audit upgrade fixture defers it to the V2 suite.
The table is migration-owned, RLS enabled and forced, with the exact 2003
job-visibility predicate, plus the restrictive `v2_practice_firm` firm rule
(the 2047 shape: a mandatory join to `app.job` on tenant and job) so linked
practice firms sharing one backing tenant cannot see each other's drafts. Runtime
has SELECT/INSERT only. No new function grants.
These are temporary working-data privileges for synthetic builder statements,
not a checked authority operation or a real safety certification.

Generate, edit and sign serialize with quote/plan edits on the quote draft.
All three insert their snapshot and append one `audit.v1` input via
`appendAuditBatch` in the same transaction, with the actual linked membership.
A replay checks current access and the actor/input hash and returns the old
snapshot before freshness checks; it appends nothing. Audit carries only IDs,
revision numbers and the snapshot hash, never section text or contact details.

Proofs are the Q06 block in `tools/v2/seed.integration.test.mjs`: lifecycle,
regeneration, replay/conflict/concurrency, stale plan, rollback of all three
commands when audit fails, tenant/job/FK isolation, runtime mutation refusal,
RLS/grants and no-op reapplication. These must run in the full V2 seed suite.
Browser/phone and actual printed-PDF text proofs are in
`tools/v2/rams.browser.test.mjs` (V2_TEST_ORIGIN, signed-in browser state reused).
They require a production Next server to keep dev indicators off, or a
router-supplied test Next configuration with `devIndicators: false`.

Expand compatible: no existing rows/routines change. Forward-fix through a
separately reserved migration; do not delete signed history. Reverting the
application can leave this unused table intact. Reapply the bootstrap to test
idempotent upgrade; fresh V2 installation exercises creation.

Inherited c3 plan-creation audit gap remains owned by the c-chain repair;
re-merge c3 after its fix before merge. No source-pinned file was changed.
No independent acceptance, safety review or real-data release is claimed.
