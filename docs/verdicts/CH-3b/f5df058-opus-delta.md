VERDICT: PASS — bound to head f5df0581d1c7223f6238a22482dcde1beff52850
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (8 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** all four items from the REPAIR at 9023506 are genuinely fixed. R1, R3 and R4 each come with a regression test that would fail on the old code and passes now. R2 is a one-line deletion that makes the file identical to main's. Nothing outside those items changed, apart from the integrator's ledger paragraph. The edit to 0102 is safe because 0102 has never been applied to any lasting database. I re-proved the null-contact fix and the letter-case fix myself on PostgreSQL through all three entry points. CI on this exact head is green: `checks` passed on a re-run, after the first attempt hit one browser test that dropped its connection. That test is in code this PR does not touch (details under Evidence). Nothing in this round touches safety, tenancy, permissions or data. Two small notes remain (P3, not blocking): the ledger paragraph cites a ruling I could not find and is incomplete about who renumbers, and one symmetric null case is proven by my probe but not by a committed test.

**What the head is:** f5df058 sits on 9023506 (the last REPAIR head), plus three commits:
- c8d3e35 (integrator) removes the duplicate import. demo-bootstrap is now byte-identical to main's (`git diff origin/main f5df058 -- packages/db/test/demo-bootstrap.integration.test.ts` is empty).
- 830765d (integrator) adds the §12.2 ledger paragraph.
- f5df058 (Codex gpt-6.1-sol, round 3) fixes R1, R3 and R4.

Main is still df1f9c1, so nothing new needed merging. `git diff 9023506 f5df058` touches 11 files, all inside the `ch-3b` lane.

**Held by Ben, not counted against this PR** (card `jobguard-ch3b-held-clauses-2026-10-07`, "hold the two checks"):
- DW1's second clause (ENT-2's import tests call the routine and assert the refusal);
- DW3's team-scoped positive cases (an operative on the job, and that team's supervisor).

Both stay HELD, as `BUILDER_RECEIPT_round3.md` records. ENT-2 must prove both before ENT-2 is accepted.

## Each repair item, checked

**R1 (P2) — fixed.**
- **The change:** `contractorResidentBoundaryV1` now makes the contact's `name`, `phone` and `email` nullish (`packages/core/src/contractor-parties.ts:22`). This is the only schema that changed. The strict `residentContactV1`, `contractorResidentV1` and `contractorPartyImportV1` are unchanged. Malformed non-null values still reuse the same field rules (min/max, `.email()`, `.endsWith(".invalid")`).
- **What callers get now:** for `name: null`, `phone: null` with no email, and `phone: null, email: null`, both `bind` and `bindInTransaction` return the routine's `CONTRACTOR_PARTIES_REQUIRED`. The proof is the existing P2-1 test (`packages/db/test/contractor-parties.integration.test.ts:253-255`). It now checks the no-effects projection after each entry point (`:260-263`).
- **The open choice is settled and documented.** A complete contact with an explicit null optional field (`{name, phone: null, email}`) stays `INVALID_COMMAND` both ways. The contract says so (`docs/contracts/contractor-parties-v1.md:47-49`) and a test proves it (`:272-276`).
- **Core rows:** four new rows (`packages/core/src/contractor-parties.test.ts:63-72`).
- **Failing first:** the builder's red log shows these four rows failing before the fix with `Expected string, received null`.
- **Is it safe?** Loosening the boundary cannot let a write through:
  - the routine judges completeness first, treating JSON null as missing (`0102:109-116`);
  - `valid_contractor_resident` then refuses any key that is present but null (`0102:51-54`);
  - the `contractor_resident_contact.valid_resident` CHECK uses the same function.

**R2 (P2) — fixed** by integrator commit c8d3e35. The file now matches main exactly.

**R3 (P2) — fixed.**
- Both handlers declare `@ApiParam({ name, type: String, format: "uuid" })` (`apps/api/src/contractor/contractor-parties.controller.ts:15,21`).
- `apps/api/openapi.json` now lists `clientId` and `id` as required UUID path parameters. Its only changes are those two parameter blocks.
- CI ran `openapi:check`, which regenerates the spec and compares it byte for byte with the committed file. It passed, so the committed file is what the code generates.
- Two new transport tests lock the parameters in (`contractor-parties.controller.test.ts:12-18`). Together, the two checks catch a dropped decorator whether or not the spec is regenerated.
- This is slightly better than CH-3a: its parameters lack `"type": "string"`.

**R4 (P3) — fixed.**
- Unmerged 0102 adds a case-sensitive check, `AND d->'contact'->>'email' LIKE '%.invalid'`, alongside the existing regex (`0102:54-55`). The parentheses are balanced and nothing else in the function changed.
- A new raw-routine test expects `22023`/`INVALID_COMMAND` for `resident@example.INVALID` with no effects (`contractor-parties.integration.test.ts:287-294`). Before the fix, the `~*` regex accepted that address, so this test would have failed on the old code.
- A core row covers the same case (`contractor-parties.test.ts:10`).

**The 0102 edit is safe.**
- 0102 is not on main.
- The runner records migrations by name only, with no checksum (`packages/db/src/migrate.ts:59-73`), and no lint hashes migration files.
- Every commit on this branch shows Vercel as "Canceled by Ignored Build Step": f5df058, 830765d, 9023506, b281502 and c6819eb (c8d3e35 has no status). So no preview build has ever run `bootstrap:demo` against a shared database. Only throwaway CI and test databases have applied the old text.
- Renumber safety is unchanged from the last verdict.

**830765d ledger paragraph — the numbers are right, the wording is imprecise (P3-1 below).**
- These match the issued order (`CH-3b-issued.txt`: "0094 SBOX and 0054 ENT-1 merged; 0095–0099 open PRs; 0100 SV-2; 0101 M4-7-S… Do not use §12.3's 0055") and the current allocation:
  - 0102 was the next free number at dispatch;
  - 0094–0101 are owned as listed.

## Findings

No P1 or P2.

**P3-1. Ledger paragraph wording** (`BUILD_PLAN.md:3332`; integrator-owned; not blocking).
- **(a) The ruling it cites.** It rests the merge-ahead on "the coordinator's 8 October ruling". I could not find that ruling in the repository, the issued order or the round-3 order. The authority that actually covers this is Ben's 5 October merge-ahead ruling (card `jobguard-merge-ahead-of-103-2026-10-05`): CH-3b's §12.3 dependencies, ENT-1 and CH-3a, are both merged.
- **(b) Who renumbers.** It names only M0-6L as renumbering. Under that ruling, M4-5-S (0099), SV-2 (0100) and M4-7-S (0101) would renumber in the same way if CH-3b merges first. It also leaves out the reverse case: if MON-7a (0103) merges first, CH-3b must itself renumber.
- **(c) Reservations.** It does not record that CH-3b gives up its §12.3 reservation, 0055. And "0054–0093 stay reserved" still counts ENT-1's 0054, which is already merged. That wording was copied from the earlier paragraphs.
- **Fix:** one sentence, at merge or in the acceptance record. Cite Ben's 5 October card, release 0055, and say that open lower-numbered PRs renumber at their own merge, and that CH-3b renumbers if a higher-numbered PR merges first.

**P3-2. One symmetric null case is untested** (informational).
- The committed tests cover `{name, phone: null, email}` but not its twin, `{name, phone, email: null}`.
- My probe shows the twin gets `INVALID_COMMAND` from `bind`, `bindInTransaction` and the raw routine, with no writes. That matches the documented choice.
- Adding a row is optional.

**Carried forward, unchanged and not blocking** (the round-3 receipt records them):
- CH-3a's ordinary bind can replace a contractor job's parties before live. ENT-2 must guard which record wins.
- ENT-2's import route must be classified `pre_live_allowed` in CH-2's job-mutation registry. The registry test only scans `/api/jobs|decisions|recovery-cases` and Nest paths containing `jobs`, so it will not catch that route.
- The merge commit 9023506 promises a "next commit" for CH-2. None is needed.

## Evidence

**Source inspected:**
- the full diff `9023506..f5df058` and each of its three commits;
- the full PR diff against `origin/main` (29 files);
- 0102 in full: the resident validator, and the bind routine's completeness and validity order;
- the repository's `bind` and `bindInTransaction` boundary;
- the core schemas, the contract doc, the controller, `openapi.json`, `migrate.ts` and `vercel.json`;
- the Vercel commit statuses for every PR commit;
- the round-3 order, the issued order, `BUILDER_RECEIPT_round3.md` and the builder's red logs;
- the previous REPAIR verdict.

**Executed** (disk had 40–42 GB free, under the 45 GB limit, so I ran no `pnpm install`):
- I moved my review worktree `/private/tmp/opus-ch-3b-9023506-0810` to f5df058, detached.
- I ran the PR's own code from the builder worktree's compiled output, read-only. First I proved that output is the head's code: a TypeScript transpile of my worktree's `contractor-parties.ts`, `contractor-party-repository.ts` and `migrate.ts` matches the builder's `dist` exactly. The builder worktree is clean at f5df058.
- PostgreSQL 16.10 ran in a scratch data directory, started under `heavy-slot`.

| Command | Exit | Result |
|---|---|---|
| lane lint with a simulated `pull_request` event (base df1f9c1, head f5df058) | 0 | lane `ch-3b` passed, 29 files |
| transpile-identity check (3 files, head source against builder `dist`) | 0 | all 3 identical |
| my probe A: Zod boundary matrix | 0 | 21/21 |
| my probe B: PostgreSQL, all migrations 0000→0102 at head applied twice, real runtime role | 0 | 27/27 |

- **Probe A:**
  - six null shapes are accepted by the boundary with the nulls kept, and refused by the strict schema;
  - eight malformed shapes are still refused: blank or numeric name, `.INVALID`, `.Invalid`, an extra `role: null`, `version: null`, a blank phone and a real domain.
- **Probe B:**
  - five null-missing shapes (including all-null and null name with a valid email) give `CONTRACTOR_PARTIES_REQUIRED` from `bind`, `bindInTransaction` and the raw routine, with no effects;
  - two complete-with-explicit-null shapes give `INVALID_COMMAND` from all three, with no effects;
  - `.INVALID`, `.Invalid` and `.invaliD` are refused both raw and through `bind`;
  - `valid_contractor_resident` gives lowercase `.invalid` true, `RESIDENT@EXAMPLE.invalid` true (the strict Zod schema agrees), and `.INVALID`, a trailing space and `.invalidx` false;
  - positive control: the complete import then binds exactly once (1 binding, 1 resident row, 1 receipt, 1 audit event).

**Relied on CI** (run 37724089147 on f5df058):
- typecheck 7/7;
- lint 7/7, including the lane check for `ch-3b` from df1f9c1 to f5df058;
- `pnpm test` 13/13 tasks, 0 skipped:
  - core 1,605 tests, including `contractor-parties.test.ts` (11);
  - API 593 tests, including `contractor-parties.controller.test.ts` (4), with `openapi:check` passing;
  - web 350;
  - DB 572 tests in 55 files, including `contractor-parties.integration` (19, previously 18), `contractor` 18, `tenancy` 9, `UIWIRE-12` 22 and `demo-bootstrap` 4;
- build;
- `dependency-review` and `secrets` both pass.

**Browser suite (e2e):**
- **Attempt 1** (`checks` job 113138175199) failed one test of 252:
  - test: `[mobile-360] e2e/VALUE-1.spec.ts › explains the completed core job from persisted facts and follows receipt reversal`;
  - error: `apiRequestContext.post: read ECONNRESET`, on `POST http://127.0.0.1:3000/api/decisions`;
  - the other 251 passed.
- **Why I treat it as a flake, not a defect:**
  - it is a dropped connection, not an assertion;
  - this PR touches no decisions or VALUE-1 code, and this round touches no web route at all;
  - since 830765d, where the same suite passed 252/252 (run 37722605129), only contractor schema, contractor SQL, OpenAPI decorators, docs and tests have changed.
- **What I did about it:** I re-ran the failed job once (`gh run rerun 37724089147 --failed`). That is a CI re-run only; no code or branch changed.
- **Attempt 2** (`checks` job 113143089685) on the same head passed:
  - all steps, including `Running 252 tests` then `252 passed (10.6m)`;
  - lane check `ch-3b`, from df1f9c1 to f5df058;
  - `contractor-parties.integration` 19/19.
- `gh pr checks 120` now shows `checks`, `dependency-review` and `secrets` all passing.

**Not verified:**
- local typecheck, the unit suites and Playwright (I relied on CI for those);
- the resident-read success path, which is held for ENT-2;
- the Next routes, beyond reading their source.

