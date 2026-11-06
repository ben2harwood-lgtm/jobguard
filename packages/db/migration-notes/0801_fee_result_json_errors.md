# LATER-SAFETY-31 — RED signed synthetic fee JSON errors

0801 preserves 0799_fee_result_malformed_proof.sql byte for byte except for the two EXCEPTION clauses around v_payload::jsonb. Both now catch invalid_text_representation OR untranslatable_character OR statement_too_complex, raising the existing path-specific message with SQLSTATE 23514. The signature, owner, grants, body limit and every other check remain unchanged. The existing store maps 23514 to FeeCollectionError(COLLECTION_REFUSED), allowing webhook batch handling to contain the refusal. No live rail or real money is enabled.

The explicit lp0, upgrade and tenancy proof sections are empty: this body-only replacement changes no tracked catalog attributes, rows, policy, owner or privileges. No proof was derived from a database. Forward fix only: retain this migration; disable the dark executor if necessary and repair through a later reviewed migration.

Three added real-PostgreSQL cases reproduce the predecessor error using 0799 inside rolled-back DDL, then assert the installed migration's 23514 refusal with the same path-specific message and unchanged raw book, full archive and chained audit. The two Unicode cases sign a JSON string containing the literal JSON escape \u0000, targeting attempt-result and event-only casts separately. Existing tests, including the malformed JSON regressions and their filename references, are unchanged.

The deep attempt payload has 8,191 nested arrays (16,383 characters). The suggested 10,000 arrays would hit the unchanged 16,384-character limit before the cast. If the embedded server parses the deepest allowed payload without 54001, the case verifies the predecessor's existing binding refusal and explicitly skips with that reason; the handler remains. Whether 54001 triggers is unverified here and must be reported from CI.

Local verification (5 November 2026):
- node node_modules/typescript/bin/tsc -b packages/core packages/storage packages/db packages/config: passed (production source typecheck/build; test files are not in that tsconfig).
- From packages/db, node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/migration-proof-loader.test.ts: 77 passed. An initial attempt before dependency builds completed could not resolve @jobguard/core; the run after builds passed.
- From packages/db, node node_modules/vitest/vitest.mjs list test/fee-reservation.integration.test.ts: collected all 35 cases, including the three additions, without starting PostgreSQL.
- Money arithmetic and commercial boundary lints passed. PL/pgSQL CASE-in-IF lint and git diff --check passed.
- Exact source comparison confirms only the two allowed exception clauses differ between 0799 and 0801; all inherited test text is preserved. Piece-owned paths match the lane's exact allow list, excluding its own lane file.

Named holds for landing:
- HEAD already equals origin/codex/sandbox/later-safety-28 (96712905c5de52e6501ef70f62451b07b4fea7ef). No Git write, fetch, merge, commit, push or PR was performed, per this sandbox's final instructions. This is a READY NOPR handoff.
- Land after fee-store-authority/#579, later-safety-14 and later-safety-28. Recheck the latest routine body on main before landing; preserve new checks if it changed. Renumber by full filename stem only and keep 0801 after 0799; keep the new predecessor reference aligned if 0799 is renumbered.
- The official lane checker against its default main base flags inherited dependency files. Run it on the committed piece against the actual stacked base; do not widen the lane. No scanner or pin edit was made.
- No PostgreSQL or browser service was started. CI must prove failing-first predecessor 22P05 on both paths, predecessor 54001 or the explicit server-depth skip, installed 23514 normalization and unchanged financial history; run every fee-reservation case unchanged, fresh/upgrade migrations, catalog/privilege/RLS checks and all required CI. Independent RED review at the exact final head and green CI remain required. Local collection and proof tests do not establish database acceptance.

Repair round 1 (6 November 2026): READY
- Changed only the new parameterized JSON-error test from `it.each` to `it.for`, supplying Vitest's test context for the existing conditional skip. Every assertion and the explicit skip remain unchanged; migration 0801 is unchanged.
- From packages/db, `node node_modules/vitest/vitest.mjs list --maxWorkers=2 test/fee-reservation.integration.test.ts`: passed, all 35 cases collected. `git diff --check`: passed. Lane allow list exactly matches the four changed non-lane paths against stacked base 96712905c5de52e6501ef70f62451b07b4fea7ef and excludes itself.
- Full database execution is deferred to GitHub CI because this sandbox cannot start PostgreSQL or bind localhost. The independent pre-check reports the exact one-word fix passed 34 cases with 1 explicit depth-dependent skip on real PostgreSQL; this repair session does not claim that as a locally executed run. CI should run `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/fee-reservation.integration.test.ts` after the router pushes.
- NOPR handoff only: router commits and pushes; final-head RED review and required green CI remain landing gates.
