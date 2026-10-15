# LP-2 job insertion boundary — preparation v1

Status: tests-first preparation only. No migration or runtime change is delivered. No acceptance is claimed.

The issued BUILD-AHEAD header selects `origin/codex/sandbox/lp-1` at `cbd336611aa21c1a9a54f72df0863c172080c0e4` as the implementation base. Observed `origin/main` is `6671538c8d69936c162368c760dd6ce0f7f10493`. The adopted §11.8 contract remains authoritative. The parent is unmerged and its repairs remain dispatcher-owned.

The order's prerequisite rule stops enforcement where it requires a coordinator-owned fixture conversion. Its Q5 review group and Q6 actor-less practice group remain held independently. In particular, `app.transition_job` remains reachable and the four named actor-less routes are unchanged. This preparation does not close the job insertion boundary or the real-data gate.

## Prerequisites found in the issued baseline

| Source | Existing setup | Required coordinator result, before enforcement |
|---|---|---|
| `packages/db/test/migfix-4.integration.test.ts:23–24` | Runtime transaction inserts an ordinary quoting job directly. | Preserve the same job, scope and quote assertions through separately supplied owner fixture setup or a checked product journey. Supply the exact setup conversion; retain runtime execution for the operation under test. |
| `packages/db/test/quote-reacceptance-upgrade.integration.test.ts:25` | Runtime setup inserts an ordinary quoting job. | Convert the fixture through coordinator-owned setup while preserving all existing acceptance, supersession, concurrency and upgrade assertions. |
| `packages/db/test/small-builder-origin.integration.test.ts:154–156` | Owner transaction inserts an imported live practice job without a checked adoption. | Supply a checked adoption fixture with the same practice ownership, v1 value/cap, pilot track and lineage expectations. Shared ownership and a caller flag cannot become an exception to the permit boundary. |
| `packages/db/src/demo-bootstrap.ts:100–101` | Parent-owned file still contains runtime quoting inserts. | Serialize the named LP-2 caller conversion with LP-1 repairs; the BUILD-AHEAD header disallows editing the parent's files except additive exports. |

These are confirmed examples, not a complete coordinator inventory. No exact coordinator implementation or reviewed expand-compatible rollout evidence was supplied. A builder cannot invent either approval. The receipt records exact before lines and required after behavior. The existing LP-0 inventory/scanner/pins and every merged test remain unchanged.

## Intended insertion contract, unimplemented

Ordinary runtime insertion permits only draft, revision zero, with accepted/baseline quote pointers, accepted net value, recovery cap and fee policy all absent. Draft insertion does not authorize a later commercial transition. Generated ownership markers retain their existing checks.

Imported, work-order and privileged practice creation require a private exact insertion permit. It binds tenant, job, backend PID, `xid8` transaction, operation, named initial shape and the actor/command/authorization identities applicable to the existing operation. It is consumed once inside the inserting transaction, with no runtime or PUBLIC table access and no generic mint routine. A caller flag and shared routine ownership confer no permit. No existing table gains a column. No new protected-table runtime write grant is permitted under standard F.

The current eighteen-argument adoption keeps its persisted owner/receipt/exact-authorization/party checks and deferred audit-record requirements. Its historical v1 attestation and rounding remain unchanged. Its unchecked thirteen-argument signature loses effective runtime execution in the same compatibility group. ENT-2 creation retains its decided actor/client checks and atomic draft-to-live import. No additional actor permission is selected by this document.

The ordinary guard, permit consumers/minting paths, current adoption, work-order and practice creators, sandbox caller, bootstrap caller and old adoption grant withdrawal must be reviewed as one compatible insertion group. No independently deployed caller may depend on an unavailable signature. A possible sequence is to install checked creation routines additively, deploy and verify all compatible callers, retire older instances, then activate enforcement and withdraw the obsolete grant. This is a proposal requiring coordinator review; a maintenance window supplies no unchecked fallback. The present preparation deploys nothing.

Any future `0168_unchecked_job_doors.sql` requires its own upgrade proof: install predecessors, seed nonempty history, capture named pre-existing columns, full PostgreSQL types and primary-key identities, apply N alone and compare; then migrate later steps twice and compare only original identities. Canonical `row_to_json(t)::text` preserves microseconds. Rolled-back microsecond/retype controls must fail; nullable-column/function-replacement/later-insert controls must pass. No upgrade proof or placeholder migration is added without an implementation to prove.

## Independent groundwork delivered

The new fixture owns its synthetic setup connection, supplies a restricted inherited runtime login, uses the existing PostgreSQL 16 harness, `freePort` and `closeTestPools`, and never gives runtime fixture writes. Fresh physical runtime pools distinguish a truly unset import context from an empty reset setting. Temporary test data directories are retained; no deletion command is introduced.

The three new integration files contain 36 test cases. They exercise LP2-A02 ordinary shapes; LP2-A03 tenant/import settings; LP2-A04 shared-owner refusal examples; LP2-A06 old-signature refusal; existing checked-adoption persistence and rollback; ENT-2 creation; and home/sandbox state, ownership and session expiry/revocation. They are intentionally tests-first: refusal assertions are expected to fail on the unmodified baseline. They contain no skip, source hash freeze or environment-controlled success path. They are NOT RUN here because PostgreSQL/socket execution is unavailable.

This is partial test coverage, not a completed acceptance suite. Exact permit substitution/reuse/backend/transaction tests, the complete LP2-A05 authority matrix, saved-v1 coverage, LP2-A14 catalogue proof, LP2-A15 upgrade proof and the full unchanged regression evidence remain outstanding. LP2-A01/A07/A08/A09/A11 remain unbuilt under Q5/Q6; LP2-A10/A20/A21 remain unaccepted as whole criteria. The unchanged six contractor replay/refusal tests and earlier lock-order, fingerprint and authentication boundary suites remain mandatory in CI.

No AI, native, provider, public API or UI change is made. No new operational alert, data migration, backfill or financial capability is introduced. A future forward repair must use another additive migration; restoring an unchecked grant is not a rollback strategy.
