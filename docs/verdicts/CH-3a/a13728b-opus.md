VERDICT: PASS — bound to head a13728b9e6283580023b4ed95c0f4f0d0dcedfe2
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** Round 10 (`aade6d4`, parent `bd2797a`) fixes the one blocking problem from my last verdict and changes nothing else. Migration 0095's text checker no longer contains the Unicode escapes that broke databases that are not UTF8. I ran my own PostgreSQL 16 probe over every Unicode code point. In a UTF8 database the new checker gives exactly the same answers as round 9, and the same answers as JavaScript's `trim()` plus the UTF-16 length rule. The main-merge commit `a13728b` is clean, as claimed. CI on this exact head is fully green: all six suites that failed before now pass, and so do `pnpm build` and the browser suite in both mobile-360 and desktop (202/202). I found no new defects. One note for the integrator stays open (P3-1, no change needed here).

## Findings

**No P1 or P2 findings.**

### P3-1 (note for the integrator, no change needed here). Fixed migration counts and ordering in tests
- This is carried over from my last verdict. `UIWIRE-12.integration.test.ts:54,55,61` and `demo-bootstrap.integration.test.ts:62-63` assert 45 migrations and the name range `0000..0095`.
- Round 10's new SQL_ASCII test (`job-parties.integration.test.ts:271-288`) also assumes that the migration registry order matches sorted file-name order. It compares the registry list with names read back `ORDER BY migration_name`.
- That assumption holds under Ben's 5 Oct merge-ahead ruling: a PR with a lower number that merges after 0095 is renumbered above it. So it does not make 0095 or a later renumber unsafe.
- But every later migration PR (CH-2 0096, M4-1-S-R 0097, …) must update these counts, and some of these files may sit outside those PRs' lanes.

## Earlier findings: status at this head
- **Opus P1-1 at bd2797a (0095 fails to install in non-UTF8 test databases, six suites red): fixed.**
  - Both `U&` literals are gone (`0095_job_parties.sql:11-13`). Two ASCII-only dollar-quoted patterns replace them, and PostgreSQL's regex engine reads their `\u`/`\U` escapes only when the function runs:
    - the supplementary-plane range `[^\U00010000-\U0010FFFF]`;
    - an anchored trim pattern, `\A[set]+|[set]+\Z`, which replaces `btrim(…, set)`.
  - The repository now has no `U&` literal anywhere under `packages/db/migrations`. The only other non-ASCII bytes in 0095 are the raw em-dash in the sample PDF text at `:330`. That is a plain UTF-8 byte sequence that needs no encoding conversion. It is the same text as `0027:31` and `0028:74`, it was already there at `8722f7f` when the six suites passed, and it passes in them again now.
  - **Equivalence, from my own PostgreSQL probe (details below):**
    - In UTF8, the round-9 and round-10 sub-expressions agree on all 1,112,063 Unicode scalar values, each tested in 7 string shapes (alone, doubled, leading, trailing, interior, runs at both ends). Trim mismatches: 0. Supplementary-count mismatches: 0.
    - The new trim set is exactly the 25 code points JavaScript `trim()` removes (`9–d, 20, a0, 1680, 2000–200a, 2028, 2029, 202f, 205f, 3000, feff`), compared over every code point.
    - The supplementary class matches exactly U+10000–U+10FFFF (1,048,576 code points).
    - The two function bodies are textually identical outside those two sub-expressions.
    - The catalog attributes are identical: IMMUTABLE, STRICT, not SECURITY DEFINER, `search_path=pg_catalog`, LANGUAGE sql.
    - Whole-function results agree on 18,264 sampled code points across 6 boundary shapes, and on 20,000 fuzzed strings with random bounds. Those strings also all match the JavaScript trim-then-UTF-16-length model.
  - In SQL_ASCII, round 9 fails with exactly CI's error (`0A000 conversion between UTF8 and SQL_ASCII is not supported`). Round 10 creates the function and runs it correctly on ASCII input.
  - The new regressions are real tests:
    - The SQL_ASCII full-chain install-and-replay test (`:271`) would fail on round 9.
    - The UTF8 boundary test (`:54-71`) would catch any missing or extra trim character, either end of the supplementary range moving, or U+FFFF being counted twice. It covers every trim character at the 160/161 edges, the non-trim characters U+0085, U+180E and U+200B, and U+FFFF, U+10000, U+1F600 and U+10FFFF at 80/81.
  - **Nothing weakened:**
    - Round 10 touches 4 files.
    - The test file only gains lines (36 added, 0 removed). No assertion was removed, and no skip, only, retry or timeout was added.
    - The six suites were not edited, and their encoding flags are unchanged. `audit`, `capture`, `ledger` and `outbox` are not in this PR at all.
    - The lane entry is unchanged since `bd2797a`. The migration is still 0095.
    - The `MIGRATIONS.md` encoding note is accurate: installation now works on an empty SQL_ASCII database, while site writes and the backfill still need UTF8 for NFKC.
- **Opus P2-1 at bd2797a (exact-head CI incl. build and both browser projects): fixed.** See "What I relied on CI for".
- **Sol P2-1 / P2-2 / P3-4 and Opus P3-1 / P3-2 (fixed in round 9): still fixed.** Round 10 does not touch `demo-bootstrap.ts`, `synthetic-restore.mjs`, the contract or the CHECKs. CI re-proves them (demo-bootstrap 4/4, restore-rehearsal 10/10, job-parties 70/70).
- No new Sol pre-check, Codex-bot comment or review has been posted since my bd2797a verdict.

## Merge commit `a13728b` (main `f9de3ad` = ENT-4a #110 + SV-1 #111)
- **Changed files:** 87 against `6566abc` before the merge (`aade6d4`), and 87 against `f9de3ad` after it. The sets are identical.
- **Non-lane diff:** identical before and after (4,595 lines each, `index` lines ignored).
- **`packages/core/src/index.ts`:** the hunk is byte-identical. It adds only `export * from "./job-parties.js";` after `evidence-pack.js`. Main's two new exports (`enterprise-domain`, `shadow-domain`) sit further down, outside the hunk's context.
- **Lane registry:** main's 85 lanes, each identical and in main's order, followed by the single `ch-3a` entry (80 allow paths). That entry is byte-identical to `aade6d4`'s, which is unchanged since `bd2797a`. The file is byte-identical to `JSON.stringify` of that union.
- **No `export *` collision:**
  - `pnpm typecheck --force` passes with no TS2308 ("already exported a member") errors.
  - In the built `dist`, `job-parties.js` (14 runtime exports), `enterprise-domain` (33) and `shadow-domain` (48) share no names, and all 14 job-parties exports reach `index.js`.

## What I source-inspected
- Requirements: my last verdict in full; the round-10 order (`CH-3a-r10-repair.txt`) and receipt (`BUILDER_RECEIPT_round10.md`); the CH-3a card at `BUILD_PLAN.md:490` and the §12.2 0095 ledger paragraph (`:3324`).
- All of round 10: `0095_job_parties.sql` (validator, CHECK call sites, match-key trigger), both new tests, the `MIGRATIONS.md` note, `migrate.ts` (registry and runner), `pool-test-utils.ts` legacy fixture, and the six suites' `initdbFlags`.
- The merge: file set, non-lane diff, `index.ts`, lane JSON, and the export surfaces of `job-parties.ts`, `enterprise-domain` and `shadow-domain`.

## What I executed
Detached worktree `/private/tmp/opus-ch-3a-a13728b-0710` at this exact head. Node 24.17.0, pnpm 10.28.1, `pnpm install --frozen-lockfile --ignore-scripts`.

| Command | Exit | Result |
|---|---:|---|
| Merge-claim check (file sets, non-lane diff, `index.ts` hunk, lane JSON union) | 0 | identical; union exact |
| `pnpm typecheck --force` | 0 | 7/7 packages, uncached; no TS2308 |
| `pnpm build` in `packages/core` plus a runtime export-collision script | 0 | 0 shared names |
| `pnpm lint` with a simulated PR event (base `f9de3ad`, head `a13728b`, `codex/sandbox/ch-3a`) | 0 | lane boundary passed (87 files), purity, money, package lints |
| core `vitest run` job-parties / quote-document / job-import | 0 | 16 tests |
| core `vitest run src/extra-origin.test.ts` | 0 | 6 tests |
| `pnpm --filter @jobguard/web test` | 0 | 71 tests |
| api `vitest run src/job-parties.application.test.ts` | 0 | 4 tests (run after building `@jobguard/db`; the first try could not resolve the unbuilt package) |
| db `vitest run test/demo-bootstrap.integration.test.ts -t "bootstrap SQL trace"` | 0 | 1 passed, 3 PG cases filtered out |
| `node --test tools/*.test.mjs` | 0 | 42 tests |
| `heavy-slot` + my own PostgreSQL 16.10 probe (`probe.mjs`, untracked scratch) | 0 | all equivalence checks above, 0 mismatches |

About the probe:
- It used the repository's pinned `embedded-postgres` 16.10 binaries, copied to scratch, with a cluster on 127.0.0.1.
- It created three databases: UTF8 with C collation (full code-point pass), UTF8 with `en_GB.UTF-8` collation (every 13th code point plus all edge points, 5,000 fuzz cases; all 0 mismatches), and SQL_ASCII.
- It extracted both function versions verbatim from `git show bd2797a:` and `a13728b:` and installed them side by side.
- Bonus finding: round 9 also failed to install with `standard_conforming_strings=off`. Round 10 does not.
- Earlier attempts in this session failed for harness reasons only: the socket path was too long, my catalog query had a typo, and a first pass was too slow on a heavily loaded machine, so I cancelled it. They produced no results.

## What I relied on CI for
Run **37662925569**, `headSha` a13728b, all jobs `success`:
- **`checks`** (job 112934732911, 12m49s):
  - frozen install, typecheck, and lint (lane boundary on base `f9de3ad` / head `a13728b`, 87 files);
  - **`pnpm test`:**
    - db: 41 files, 277 tests, all passed. This includes the six earlier failures: audit 5, capture 2, ledger 4, outbox 11, recovery 3, tenancy 9. It also includes job-parties **70** (the SQL_ASCII full-chain test among them), demo-bootstrap 4, restore-rehearsal 10, shared-money-origin 12 and UIWIRE-12 22.
    - core: 52 files, 705 tests. `extra-origin` passed 6/6, so the known flake did not fire.
    - api 112, web 71, ai 72, storage 2, config 1, and the tools tests.
  - **`pnpm build`** passed.
  - **e2e:** 202 passed, which is 101 tests each in `mobile-360` and `desktop`.
- `secrets` passed, and so did `dependency-review` (now green with #113 merged).

## What I did not verify
- I did not run the repository's PostgreSQL or browser suites locally; I relied on CI for those. My own PostgreSQL probe covered only the validator function.
- I did not repeat the full-PR review from earlier rounds beyond what round 10 and the merge touch.
- No live providers, real data, deployment or merge.

