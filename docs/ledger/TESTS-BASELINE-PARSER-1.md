# TESTS-BASELINE-PARSER-1 — baseline parser properties and limits

Issued 17 October 2026; RED; decision 74 BUILD-DON'T-MERGE. **PARK: no merge, activation or deployment.** Base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`, branch `codex/sandbox/tests-baseline-parser-1`. Dispatcher owns commit/push; builder leaves changes uncommitted.

Added one synthetic test file, the exact issued lane file, this ledger and the builder receipt. No existing tracked file, implementation, fixture, schema, method, price, permission, policy or expected value changes. No migration, grants, persistence, provider/business actions or new operational alerts.

The 64 deterministic cases cover independent JSON/CSV encoding, seeded row/property permutations and identical source hashes/report exports; quoting/line-ending equivalence and strict malformed CSV rejection; separate input/team/job/per-job-extra/batch-extra boundaries; invalid import state preservation; and absent jobs, zero-extra jobs, unknown amounts and known zero. Eight fixed seeds, three permutation rounds per seed, maximum 12 generated jobs and four extras per ordinary job. Larger boundary data exists only in memory. The 8,000,000-character CSV case uses 15,000 extras, below the count ceilings.

Nine scratch validation-removal mutants produce meaningful assertion failures before the unchanged implementation passes. The per-job and aggregate extra ceilings are both 20,000: demonstrating rejection of an overfull single job requires removing both guards in that control. This does not independently demonstrate the redundant per-job schema guard; the separate multi-job case exercises the aggregate guard.

See [the receipt](../verdicts/TESTS-BASELINE-PARSER-1/BUILDER_RECEIPT.md) for commands, logs, retained scratch, reviewer provenance and remaining gates. Sol-high returned a snapshot PASS. Claude Opus could not run because the installed CLI is not logged in. The RED pair, exact-commit independent verdicts and separate technical acceptance remain outstanding. This work proves neither durable importing nor authenticated historical scope nor completion of ENT-9.
