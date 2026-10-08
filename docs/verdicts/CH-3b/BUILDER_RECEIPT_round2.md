# CH-3b builder receipt — round 2 (repair)

Builder: Claude Sonnet 5.5, acting as BUILDER only. This receipt records source inspection and local
execution. It is not independent verification, a review or technical acceptance.

Repairs the independent Claude Opus 5.5 verdict **REPAIR** bound to head
`c6819ebca40599cf2dc94e16f6bc0ffbb5916b0c` (PR #120, branch `codex/sandbox/ch-3b`, base
`0264158ffa8fbe61f7c896be9a9c5aa210f07af0`). Round-2 head: the single commit that carries this receipt
(its SHA is reported by the dispatcher; a receipt cannot contain its own commit ID). Nothing was pushed, merged
or opened as a PR. No `pnpm install` was run. No merged migration (0000–0095) was touched.

## HELD (unchanged, binding)

Ben, card `jobguard-ch3b-held-clauses-2026-10-07`, 7 Oct 2026 about 21:00, exact words **"hold the two checks"**.
Both stay HELD in this receipt, the verdict and the acceptance, and ENT-2 must prove both before ENT-2 is accepted:

1. DW1's second clause: ENT-2's import tests call this routine and assert the refusal.
2. DW3's team-scoped positive cases: "an operative on the job" and "that team's supervisor" (the job-to-team link
   `job_assignment` is ENT-2's). The read success path of `app.read_contractor_resident` therefore still runs in no
   test; every read is denied by design until ENT-2 supplies job assignment.

`assertContractorPartiesRequired` is a helper for ENT-2. Its existence, and the new tests below that use it against CH-3b's
own entry points, are not evidence that ENT-2's import tests ran.

## What changed, by verdict item

**P1-1 — four fatal SQL errors in `0102_contractor_parties.sql` (number unchanged).**

| | Fix |
|---|---|
| (a) | `valid_contractor_resident` body now quoted `$fn$ … $fn$`, so the `$$` inside its email regex no longer ends the body early. |
| (b) | `d->'contact'-ARRAY[…]` is now `(d->'contact')-ARRAY[…]`. |
| (c) | The `CASE` inside the PL/pgSQL `IF` condition in `require_contractor_party_record` is parenthesised. |
| (d) | `payload` was both a parameter and a column of `customer_revision` / `site_revision`. The parameter is now qualified with the function name (`link_contractor_customer.payload`, `bind_contractor_parties.payload`) in the three statements that read those tables. The read routine had the same kind of clash (`job` parameter against the `app.job` row reference): its parameter is renamed `p_job` (callers pass it by position; the signature `(uuid,uuid)` is unchanged). The reviewer's in-memory patch used `#variable_conflict use_variable` instead; explicit names were chosen so nothing is silently re-resolved. |

**P1-2 — three test bugs.**

- DW3 role matrix (`contractor-parties.integration.test.ts`): the loop is over `contractorRoles` without `owner`. The owner
  row is the practice principal itself (denied the read, for the real and an unknown job ID), and the test now asserts that
  inviting an `owner` is refused with `FORBIDDEN` (ENT-1, 0054:233).
- Q3 `organisation.manage` matrix (`contractor.integration.test.ts`, in the ch-3b lane): the owner row uses the practice
  principal at tenant scope only (`permitted` stays true there); region/branch/team rows are skipped for `owner`; an `owner` invite
  is asserted `FORBIDDEN`. No existing assertion changed.
- Forged-receipt test: the semantic key is now its own text parameter (`$6::text`) and `$1` is cast `::uuid`, so the deferred guard's
  `23514` is reached.

**P2-1 — the entry point ENT-2 is told to use now returns `CONTRACTOR_PARTIES_REQUIRED`.**

- `packages/core`: new `contractorPartyImportBoundaryV1` / `contractorResidentBoundaryV1`. They are the same strict schemas with
  client, contract, site and resident nullable, a contact allowed to lack its name or both phone and email, and a no-resident entry
  allowed to lack its reason. `contractorPartyImportV1` and `contractorResidentV1` are unchanged and still require everything.
- `ContractorPartyRepository.bindInTransaction` and `.bind` parse with the boundary schema, so the routine, after its membership check,
  does the refusing. Present-but-malformed values (blank text, bad or non-`.invalid` email, unknown reason, extra keys) are still
  `INVALID_COMMAND`.
- In the routine the order is: active membership, then completeness, then role authority. Completeness has to come before
  authority because a missing client leaves no client scope to authorise against; the refusal only reveals the shape of the caller's
  own payload. A payload that is not a JSON object is `INVALID_COMMAND`.
- **Decision recorded (the verdict asked for one):** "missing" means absent or JSON null. A resident that is a contact lacking a name,
  or lacking both a phone and an email, a contact entry with no contact, or a no-resident entry with no reason counts as missing
  (the card requires a name plus at least one of phone or email, so anything less is not a resident contact). Documented in
  `docs/contracts/contractor-parties-v1.md`.
- Tests (real PostgreSQL, through `ContractorPartyRepository`, not only raw SQL): for client, contract, site and resident, each null
  and each omitted, plus six incomplete-resident shapes, both `bind` and `bindInTransaction` are asserted with
  `assertContractorPartiesRequired`, and the counts of bindings, residents, CH-3a bindings, receipts, bound-audit events, outbox actions
  and the job revision are identical before and after. Malformed values are asserted `INVALID_COMMAND`. A read-only member gets 404 for a
  complete command. Core tests cover the boundary schema.

**P2-2 — integrator decision (binding): the customer's current revision is required.**

- `link_contractor_customer`: the supplied revision must be the customer's latest; otherwise `STALE_REVISION` (checked before
  the type). The latest revision's type must equal the client kind (`CUSTOMER_TYPE_MISMATCH`).
- `bind_contractor_parties`: the customer used is the linked customer's **latest** revision at import time, not the revision seen at link
  time. Its type is re-checked against the client kind and a mismatch is `CUSTOMER_TYPE_MISMATCH` with nothing written. The stale
  revision is never pinned on a job. The payer defaults to that latest revision.
- Why latest-at-import and not "refuse unless the link's revision is still latest": the link is immutable and unique per client, so
  refusing every customer edit would make the client unusable for ever.
- Real-PostgreSQL regressions (three tests): the exact scenario (linked as an insurer, revised to a person: import refused with
  `CUSTOMER_TYPE_MISMATCH` through both entry points, no effects, no job binding to either stale revision; revised back to insurer: the import
  succeeds and pins the newest revision); link refuses older revisions with `STALE_REVISION` and a person revision with
  `CUSTOMER_TYPE_MISMATCH`; a same-type revision is pinned at import.
- `docs/contracts/contractor-parties-v1.md` and `packages/db/MIGRATIONS.md` updated (they previously said the pinned revision was kept).

**P3 — done cheaply.**

- Catalog test now also asserts `prosecdef` and `proconfig` (`search_path=pg_catalog`) and runtime/infrastructure EXECUTE for the three routines,
  the record-guard trigger function (SECURITY DEFINER) and the two non-SECURITY-DEFINER functions.
- Renumber safety: no test assumes 0102 is the last migration or that there are 48 migrations. The CH-3b and ENT-1 suites apply every migration
  before `0102_contractor_parties.sql` by position and let `migrate()` apply it and anything after it; `UIWIRE-12` asserts the recorded migration
  names equal the declared names exactly (stronger than the old count) and `demo-bootstrap` compares with `MIGRATION_URLS.length`. 0096–0101 or 0103
  can merge first without touching these tests.

## Follow-ups recorded, not done in this round

- **CH-3a interplay:** after a contractor bind, CH-3a's ordinary owner `bind` command (before live) can replace the work-order job's customer with an
  unrelated one; the contractor binding does not change. The contract should say which record wins, and ENT-2 should guard it.
- **Read success path** (`read_contractor_resident` success and its response schema) runs in no test: ENT-2's held positive cases must cover it.
- **DW5:** no test where two different commands import the same work order at the same time (the reviewer's probe: 1 bound, 2 `STALE_REVISION`).
- **AI privacy test** hands the gateway only `workDescription`; the real protection is the column-level grant (runtime cannot SELECT `contact` or `no_resident_reason`).
- **Payer revision:** a work-order-named paying party is not required to be its customer's latest revision (the decision text covers the client's customer).
- **§12.2 ledger entry for 0102:** integrator-owned, not in this PR.

## Commands actually run (worktree `.worktrees/ch-3b`)

Environment: macOS, Node v24, pnpm 11 shim. `pnpm install` was not run. The embedded PostgreSQL 16.10.0-beta.15 binaries in this worktree's
`node_modules` could not start (pnpm skipped the darwin postinstall, so the dylib symlinks are missing; first run: "Postgres init script exited with code null").
The same binaries were run through a scratchpad copy that has the symlinks, selected by a vitest `resolve.alias` in a config file kept **outside** the repository.
It changes no test setting (no timeout, no skip). The same 16.10 engine therefore ran the suites below. Database runs went through `heavy-slot`.

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @jobguard/core exec vitest run src/contractor-parties.test.ts` | 0 | 7 tests (4 original, 3 new) |
| `pnpm --filter @jobguard/core test` | 0 | 108 files, 2874 tests |
| `pnpm --filter @jobguard/api test` (includes `openapi:check`) | 0 | 23 files, 386 tests |
| `pnpm --filter @jobguard/db exec vitest run test/contractor-parties.integration.test.ts` (alias config) | 0 | 18 tests (14 original, 4 new) |
| same, with `test/contractor.integration.test.ts test/job-parties.integration.test.ts test/tenancy.integration.test.ts test/UIWIRE-12.integration.test.ts test/demo-bootstrap.integration.test.ts` | 0 | 5 files, 139 tests (ENT-1 suite with the Q3 matrix, CH-3a, tenancy and bootstrap catalogs, UIWIRE-12 upgrade) |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `pnpm build` | 0 | 7 of 7 tasks |
| `pnpm lint` | 0 | 7 of 7 tasks |
| `pnpm openapi:check` | 0 | no change needed (no route changed) |
| `tsc` over the CH-3b integration test and the core test with a temporary config (the db package type-checks `src` only) | 0 | no errors |

**Failed-first evidence.** Round-1 head `c6819eb`: CI run 37696960100 failed 39 of 44 database test files on the migration syntax error, and the reviewer's
probe A got the same error from the exact file. For the two behaviour changes, the new tests were run against the old logic, then the old logic was
restored (diffed against a backup):

- old P2-2 logic (link accepts any revision; import pins the link-time revision): the three new current-revision tests fail (exit 1);
- old P2-1 logic (strict schema at the repository): the P2-1 test fails with `INVALID_COMMAND` (exit 1).

**Lane lint:** `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<simulated event> node tools/agent-lane-boundary-lint.mjs` with base `0264158…` (local `origin/main`) and head set to this commit: exit 0, lane `ch-3b`, 29 files, all inside the lane. The lane line itself is unchanged.

**Not run here:** the full `pnpm test` root (`node --test tools/*.test.mjs` plus every package), the full `pnpm test:db` (only the CH-3b, ENT-1, CH-3a, tenancy,
UIWIRE-12 and bootstrap files above), `pnpm test:e2e` and browser suites (no route or screen changed; existing suites stay mandatory in CI),
and the reviewer-requested CI re-run on the new head.

## Status

Prepared, locally tested and committed on the branch only. Not independently reviewed, not accepted, not pushed. Independent Claude verdict on the new
head and separate technical acceptance are still owed, as are D12 v4, D04, G1 and ENT-14 (all closed or proposed). Both held ENT-2 clauses remain HELD.
