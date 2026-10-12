# CH-7-TERMS builder receipt — preflight blocked

Builder: Codex GPT-6.1 Sol.
Issued order: 12 October 2026; Q1–Q5 as adopted in the dispatch header.
Base and unchanged Git head: `18743cb5aad8578960296ad2fd60c104cb16e90e` (`HEAD` equals local `origin/main`). No fetch, checkout, add, commit or push was performed. Latest remote state was not independently fetched in this sandbox.

Status: **NOT BUILT; authorization-design conflict requires an amended order.** This is source inspection, not an executed PostgreSQL finding. No approval routine, migration, route, guard or product change was written. The request for an amendment is pending; silence is not authorization.

## Blocking conflict and concrete amendment

T2 requires that a direct `jobguard_runtime` call using a hand-made receipt and authorization for a non-owner cannot commit. The design instead says: "You call it; you do not restate its membership test, its receipt logic or its audit append in your own SQL or TypeScript." Migration item 3 prescribes an exact-authorization join with no active-owner membership predicate. Those two instructions cannot both be satisfied by that routine at this base.

Evidence inspected:

- `packages/db/migrations/0005_commands.sql:71`–76 grants `jobguard_runtime` SELECT and INSERT on `decision`, `decision_resolution`, `action_authorization` and `command_receipt`; their forced-RLS policies constrain tenant identity, not the actor's role.
- The constraints at `0005:12`–44 require valid identifiers and relationships, not owner membership. `app.require_approved_resolution()` at `0005:47`–55 checks only the matching approved resolution.
- The owner gate is TypeScript in `packages/db/src/commands.ts:84`–86. Direct SQL does not execute `UserCommandDispatcher.dispatch`.
- The cited routine model `packages/db/migrations/0109_job_activation_terms.sql:58` has its own active-owner predicate, separate from its authorization join at lines 59–65. The new routine's prescribed checks omit that predicate, while the design expressly prohibits restating it.
- Searches across every migration in the local tree found no later revocation of these INSERT grants or applicable owner-checking trigger on these four tables. The later command triggers are scoped to `inbox.seed` (`0096:240`), `contractor.%` (`0054:292`), and contractor-party commands (`0102:218`); none applies to `recovery.terms.approve`.

Concrete counterexample to the prescribed design, not executed:

1. In the correct tenant context, select an existing non-owner membership and an otherwise eligible synthetic withheld-payment case on a v3 job.
2. As `jobguard_runtime`, insert a processing `recovery.terms.approve` receipt for that membership, a matching case Decision, an approved resolution and an exact unexpired authorization. Use the routine's canonical terms hash, revision 1, proposed v3 policy, and NULL recipient/amount/currency.
3. Call the prescribed SECURITY DEFINER routine with those IDs. Every specified authorization predicate is satisfied; none tests active-owner membership. The runtime's lack of INSERT on the new terms table does not prevent the definer routine from inserting it.

Requested amendment: permit the new routine's single exact-authorization query to join `app.membership` on the tenant and actor and require `role='owner'`, no revocation, and no expired membership. This changes only the new routine, preserves the dispatcher and all merged files, and makes T2's direct-call assertion enforceable. Do not weaken T2 or change existing grants. Without this explicit exception to the prohibition, the affected implementation remains blocked under AGENTS §1's conflict rule.

## Changed files

- `config/agent-lane-assignments.json`: the first working-tree edit added exactly the prescribed compact `ch-7-terms` lane line after `ch-7`, before `checker-adopt-demo-plan`. Its note describes the issued scope, not completed implementation.
- This receipt: records the unresolved conflict and distinguishes inspection from verification.

Migration 0134 is not created or registered. No existing migration or merged test was edited. The eligibility contract sentence still truthfully describes the merged hold; it was not changed to claim B4/DW2 were built.

## T1–T13 status

| ID | Status | Reason |
| --- | --- | --- |
| T1 | NOT BUILT | Approval implementation blocked before test/code construction. |
| T2 | NOT BUILT | Required direct-call owner refusal conflicts with prescribed routine; see evidence above. |
| T3 | NOT BUILT | No routine or schemas built. |
| T4 | NOT BUILT | No dispatcher-backed repository built. |
| T5 | NOT BUILT | No pursuit triggers built. |
| T6 | NOT BUILT | No pursuit triggers or approval command built. |
| T7 | NOT BUILT | New table does not exist. |
| T8 | NOT BUILT | New command does not exist. |
| T9 | NOT BUILT | No new approval or authorization exists; unchanged-file evidence below is inspection, not a test. |
| T10 | NOT BUILT | New table and timestamp pin do not exist. |
| T11 | NOT BUILT | Migration 0134 and its upgrade proof do not exist. |
| T12 | NOT BUILT | Implementation contract and migration note cannot claim completion while blocked. |
| T13 | NOT RUN | Merged suites remain unedited; database/browser execution is prohibited here. |

No test title or passing assertion is claimed. No permanent test freezing unowned files was added.

## Check lane — four questions

1. Can this diff make a real charge possible or sooner? **No product code changed.** The real-charging lock remains untouched.
2. Can any role but an active owner create, change or remove an approval? **The requested feature is absent.** The prescribed future routine would allow the non-owner direct-call construction above unless amended; it cannot receive a passing verdict as drafted.
3. Can a chase row for a guarded case commit without one? **The new guard is absent.** B4/DW2 are not implemented in this working tree.
4. Is anything previously refused now allowed? **No runtime behavior changed.**

Fresh independent RED reviews, helper execution and separate acceptance remain outstanding. This receipt is not a reviewer verdict.

## Scope, policy locks and seen-not-changed notes

A builder's agreement to the proposed fee terms for a case is not approval of the fee policy and authorises no charge.

Chasing a withheld payment on a job that is not bound to the v3 fee policy is NOT guarded by this order.

The latter is the issued Q1 scope limit for the intended implementation; because construction stopped, this working tree adds no guard even on v3 jobs. The unguarded remainder needs the separately issued follow-up RED order.

Source inspection: the product case-opening repository checks only job existence at `packages/db/src/recovery-case-repository.ts:104` and writes the new case at line 110, with no fee-policy binding check. This repository path permits opening a withheld-payment case on a job without v3 binding when its other authorization/source requirements are satisfied. No browser execution is claimed.

`app.membership.role` is `varchar(40) NOT NULL` with no closed enum/check at `packages/db/migrations/0000_tenancy.sql:47`. The exhaustive schema-permitted role domain is open, so no finite list of every permitted role can truthfully be supplied. Product invitation values at `0111:23` are admin, estimator, foreman, operative, finance and read_only; contractor role-grant values at `0054:45` are owner, admin, operative, supervisor, surveyor, commercial_manager, finance, read_only and client_approver. These are separate constrained product domains, not a closed constraint on `app.membership.role`. The dispatcher permits only owner.

`proposedDecisionRecords.D01` still names `reference_fee_policy_v1`; the D01 decision record names v3 and remains proposed. Seen, not changed.

SHA-256 at base and working tree (identical):

| File | Base and tree SHA-256 |
| --- | --- |
| `packages/config/src/policy-gates.ts` | `fc84712246163ae958dccf03503ff6267df9213554c47d8be214e012c65c1875` |
| `docs/decisions/d01-commercial-fees-cap.md` | `47f7c68e5be4de0a31f037c0f2a47570e5bbc8fe376bcdc9ab68829ec36381a5` |

`git diff --stat origin/main -- docs/decisions packages/config BUILD_PLAN.md AGENTS.md` exited 0 with no output. Hashes came from `git show origin/main:<path> | shasum -a 256` and `shasum -a 256 <paths>`. This is receipt evidence, not a standing test.

T9(b)'s catalog-based financial-table count comparison was not performed: no database was started and no approval was built. No inferred source list is represented as an actual database catalog or count.

## Privilege inspection

There are no new database objects in this diff. No new-object privilege table can be presented as implemented or verified. The existing grants driving the blocker are:

| Role | Existing privilege relevant to the counterexample | Existing restriction |
| --- | --- | --- |
| `jobguard_runtime` | SELECT/INSERT on Decision, resolution, authorization and receipt | Forced tenant RLS, foreign keys and approved-resolution trigger; no SQL active-owner requirement on these inserts |
| `jobguard_migration` | Owns these existing tables | Forced tenant RLS includes migration role; privileged DDL remains outside runtime authority |
| `jobguard_infrastructure` | No business authority granted by this change | No grants added |
| `jobguard_identity` | No business authority granted by this change | No grants added |

## HELD and owed

- All real charging, fee derivations/postings/journals/statements/collection/refunds, standing authority, providers/adapters, production/pilot modes, configuration and G4-S changes.
- Formal policy approval: D01/D03 remain proposed.
- Every screen, terms wording and rates in new records/responses.
- DW3, revocation, withdrawal and re-agreement under a new version.
- The later live M4-5 call to the shared guard.
- Insurer wording, PRACTICE-FACTS-1b, and all adjacent lanes' work.

UI list entry required by the dispatch: "agree-terms button missing: chasing a withheld payment is refused in the practice app until it exists". This describes the intended guard-on release; no guard was installed by this blocked diff. The UI remains parked.

CH-7 remains not fully accepted. B4/DW2, the screen and live guard integration are owed; DW3 remains its own later RED order.

## Verification and self-review

Repository inspection established Node `v24.17.0`, clean starting tree, and matching base/HEAD. Read-only searches examined the relevant grants, triggers, membership schema and dispatcher. The requested amendment was sent to the user; no response was assumed.

Database integration and all Playwright checks: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No database, browser, provider call or Git write was attempted. No explicit install/download command was requested; the prescribed pnpm invocation's version-switch shim attempted registry fetches and refused to run, as recorded below. No retry or alternative pnpm invocation was attempted.

Unit tests, typecheck, full lint, build and OpenAPI generation/check: NOT RUN at this blocked preflight stage; no source, test, route or OpenAPI change exists to validate.

Commands actually run:

- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, before the lane checker ran. The installed launcher refused to switch to the pinned pnpm version: `[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed).` The launcher also warned that `pnpm.overrides` is ignored by its current version. This does not establish that the repository or registry is tampered with; the reported fetches failed. No bypass of its signature check was attempted.
- `git diff --check`: exit 0, no output.
- `git diff --numstat origin/main`: exit 0; `1 0 config/agent-lane-assignments.json` (Git does not include the untracked receipt in that diff).
- `node -e` with JSON parsing and a presence assertion for `lanes["ch-7-terms"]`: exit 0; `Lane JSON valid; ch-7-terms present`. This is deterministic JSON validation, not a security or model review.
- `git status --short`: exit 0; only the modified lane file and untracked `docs/verdicts/CH-7-TERMS/` directory.
- `ps -eo pid,ppid,etime,command | rg 'pnpm|lane-boundary|42949'`: exit 1; `zsh:1: operation not permitted: ps`. Process inspection was stopped; no alternative process-inspection method was tried. This was an OS sandbox refusal, not an automatic approval-review rejection.

No test executed and no passing test count is claimed. The intended documentation-only commit message is in `/private/tmp/jg-msg-ch-7-terms.txt`. No build output, `.pnpm-store` or `test-results` was created by this task in the working tree.

Self-review: only one lane line and this blocker receipt were added. No earlier grant, routine, policy, column, screen, provider, held behavior, security list or test changed. No credential-shaped value or unowned-file pin was added. T2 is not marked satisfied by a TypeScript check that direct SQL bypasses. The proposed amendment is confined to the future new routine and requires a ruling before construction resumes.

Builder receipt only — not independently verified, not accepted.
