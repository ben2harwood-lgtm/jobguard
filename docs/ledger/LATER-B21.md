# LATER-B21 — Populated recovery wrong-job proof

Item L115 / dbsrc-11#7. RED check lane; decision 74: PARK, never merge, enable or deploy without Ben's button.

Initial base and unchanged HEAD: `4c407a6c81bd714a6875b7adf995812381d0fe57`, superseding both issued base references. Shared `origin/main` advanced to `7ff452eeec1c523345d34715adfa3f8310062013` during checks; all cited plan/source/test files were rechecked and unchanged between those refs. No migration, production changes or existing test edits.

Added one PostgreSQL test file with three cases: both directions of populated same-tenant wrong-job refusal, exact error and unchanged stored effects, valid owning-job twins, and an isolated omission of the real repository lookup's job predicate detected by the same refusal assertion. Fixtures are made up. PostgreSQL execution is NOT RUN in this sandbox; no runtime isolation defect is claimed.

Coordinator prerequisite: `config/lanes/later-b21.json:1` is absent, with no legacy lane entry. Registration is outside this issued file allowlist and remains untouched. Both lane commands exit 1 for the missing registration. Forced typecheck, lint and build each pass 7/7 tasks, zero cached. OpenAPI check stops on a sandbox `listen EPERM` refusal. Builder receipt records exact evidence and checks still required.

Status: built, uncommitted, awaiting CI database evidence and independent RED verdicts. Builder does not record acceptance. Receipt: `docs/verdicts/LATER-B21/BUILDER_RECEIPT.md`.
