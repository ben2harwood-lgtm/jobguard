# LATER-B10 — Site replay and pricing consistency

- Builder: Codex. Branch: `codex/sandbox/later-b10`. Uncommitted HEAD: `31682762c903d716657c573e1b5deae63588aad7`.
- Status: implementation and synthetic PostgreSQL regression coverage prepared; validation incomplete. PARK under decision 74. No merge, enablement, deployment or acceptance.
- L034: receipt existence and priced revision now use one statement snapshot; the new regression commits a real writer between reader statements.
- L035: current authority is checked under the shared tenant administration lock before a read-only replay. The original grant binds the request hash; fresh commands retain live-job/open-visit checks. Exact stored results include photo/confirmation facts where applicable.
- L036: current visit authority and ownership precede receipt reads; exact stored start/completion results precede the live-job guard. Changed payloads conflict, and fresh commands still require a live job.
- L037: new coverage checks every result from concurrent same-session and distinct-session starts, each new tenant/member/identity, tenant isolation, and each identity after revocation. No merged test changed.
- Migration: none. New GRANTs: none. New routes/UI/provider actions: none.
- Tests first: both new database test files were written before source edits. They were NOT RUN because the order excludes PostgreSQL/socket runs in this sandbox. No failing-run or passing-run claim.
- Check limits: 44 GB free disk, below the required greater-than-45-GB floor; forced typecheck/lint/build NOT RUN. Lane lint, diff whitespace check and five-file TypeScript syntax parsing passed; syntax parsing is not typechecking.
- Main advanced from `31682762c903d716657c573e1b5deae63588aad7` to `4c407a6c81bd714a6875b7adf995812381d0fe57` during work. No cited source/contract file differs between these heads. Issued bases `ca435eeb5791638c787c830d6ba717146f694539` and `0bbb5ddb` are stale; current main wins.
- Remaining gates: resource recovery, forced checks, CI PostgreSQL regressions, independent RED Opus and Sol-high verdicts on the dispatcher-created commit, separate acceptance, and Ben's button. Receipt: `docs/verdicts/LATER-B10/BUILDER_RECEIPT.md`.
