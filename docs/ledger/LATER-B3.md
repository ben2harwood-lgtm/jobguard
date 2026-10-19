# LATER-B3 — Capture gateway and evaluation correctness

Built locally on `codex/sandbox/later-b3`, against local `origin/main` / HEAD
`7ff452eeec1c523345d34715adfa3f8310062013` (ahead of the issued base).

L001 validates nested schema-retained source spans against stored inputs, including
repaired output. L002 gives each supported source occurrence recall credit once.
L003 converts a throwing repair into a typed `invalid_output` failure and keeps
the one-attempt bound and successful provenance.

The 22 new tests, 8 existing shadow tests and 72 existing capture/gateway fixture
checks pass. Existing tests, corpus labels and expected metrics are unchanged.
No migration, grants, dependency, prompt, live provider or UI changes.

Technical acceptance remains pending the independent AMBER verdict on the
dispatcher-created commit and separate acceptance. Lane registration is HELD:
`config/lanes/later-b3.json:1` is absent, and the legacy register has no entry for
this branch. The builder did not change either register. Full CI and the applicable
approved-region live evaluation remain release gates. See
`docs/verdicts/LATER-B3/BUILDER_RECEIPT.md` for executed checks and limitations.
