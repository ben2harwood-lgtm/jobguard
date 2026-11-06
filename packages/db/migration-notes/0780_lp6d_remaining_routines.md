# LP-6d remaining routines — RED, NOPR, held for landing

## 6 November — real-PostgreSQL recheck repair round 2 (last): READY

READY for router staging, NOPR commit/push and CI; not database verification,
independent RED acceptance or permission to land. Pending merge is LP-6c
`397a5a53e11fcd5a30121e0ec65762f129e2edbc`. The contractor-party fixture conflict
is resolved in the working file, retaining the session changes from both sides;
the sandbox leaves the Git index unmerged for the router.

Repairs:

- Remove only the `mon8_feature_decision` replacement from the bound set. Its
  unchanged subject-membership feature lookup serves pre-session SSO and retained
  scheduling reads. All other routine guards remain; its request wrappers still
  enforce their actor/tenant checks. Manifest/classification tests name the exception.
- Work-order and contractor-party error mappers hide `RequestBindingRefusedError`
  as NOT_FOUND. Adapter tests assert that result without leaking database details.
- Bind contractor bootstrap immediately after issuing the credential and before
  tenant reads/audit. The shared extras fixture now uses that principal's context.
  Fee illustration binds before revoking the owner to test the owner recheck;
  recovery-legacy uses an issued practice session. Raw routine tests separately
  assert unbound refusal and the original business refusals with bound callers.
  Cross-branch commit probes prepare an audited binding and use separate actor
  transactions, preserving the commit-level defence without rebinding.
- LP0-02 proof names retained timeline ownership and private session ownership;
  LP0-17 records both new routine identities and their exact execution disposition.
  The human catalogue describes the amendment; no scanner or fingerprint is edited.
- Copy main's latest `lp_read`, `lp_command`, `lp_finish` (0620),
  `accounting_export` (0599), and both `mon9_elect` overloads (0614), retaining
  the binding guards. Main inspected: `128260957477d6be9aa88e94789095ac23a175f6`.
  This serial branch lacks those main migrations. Exact source snapshots in
  `test/lp6d-main-predecessors.json` support the body-preservation tests until
  router catch-up; an installed predecessor takes precedence over the snapshot.
  The snapshots do not install tables or pretend the branch is caught up.

Executed locally (installed binaries, no installation, at most two workers):

- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6d-routines.test.ts test/lp6d-repository-context.test.ts test/migration-proof-loader.test.ts`
  — **104 passed**.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6c-money-routines.test.ts test/lp-0-catalog.test.ts src/recovery-legacy-later.test.ts`
  — **54 passed**.
- From repository root: `./packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts --maxWorkers=2 apps/api/src/workspace/fee-illustration-later.test.ts apps/api/src/contractor/contractor-parties.application.test.ts apps/api/src/contractor/work-order.application.test.ts`
  — **49 passed**. Total **207** targeted tests.
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`
  — passed. TypeScript transpilation syntax check of seven changed fixture/test
  files — passed. `git diff --check` — passed.
- `LANE_BASE_REF=origin/codex/sandbox/lp-6c-money-routines node tools/lint.mjs`
  — core purity passed; lane check blocked by 14 inherited LP-6c files still
  present in the pending merge index. Router must stage the resolved merge and
  repeat the actual guard. Lane allow-list is the exact 47 non-lane paths changed
  over LP-6c, including untracked source snapshot, excluding all config/lanes paths.
- The default pnpm wrapper could not verify pinned 10.28.1 via the restricted
  registry. Direct installed runners above completed the checks. No packages
  were installed and the version-verification setting was not changed.

CI after router catch-up/push must prove (at most two workers per run, at most
three named Vitest files per run): enterprise-identity; work-order-import;
contractor-parties; fee-illustration-later; recovery-legacy-later; lp6d-routines;
quote; quote-reacceptance; lp-0-grant-freeze (LP0-02); lp-0-authority-paths
(LP0-17); contractor-full-demo-package; sor-pricing; evidence; proof-replay;
serious-b4-evidence-proof. Also required: full ordinary CI and fresh/upgrade/repeat
PostgreSQL migrations, applicable browser journeys, current-main routine
classification, customer-proof sibling landing and exact-head independent RED
review. PostgreSQL and browser execution are prohibited by this sandbox; none
was attempted or claimed. Earlier customer-proof/source-guard and migration
reservation holds below remain separate router landing work.

## 6 November — security precheck repair round 1: READY

Repair of the single blocking finding against `cdd4e3282`, on LP-6c base
`531e7d633`. READY means source repair ready for the router's NOPR save and CI;
it is not PostgreSQL execution, an independent review PASS or landing approval.

- Contractor session resolution now carries its genuine session-bearing context
  with the resolved membership. Work-order, SoR, contractor-party and contractor
  administration repositories consume that context instead of minting a bare
  membership context. Generated work-order/Northside callers retain that type.
  This reuses the existing membership/session constructor and `withTenant`; no
  new binding mode, fallback, opt-out or runtime grant is introduced.
- Recovery and fee-illustration methods require the caller's context. Their API
  applications pass `practice.context`; reads use its tenant rather than the
  module-level demo identity. Existing command, approval and money checks stay.
- Update affected adapter-double types and fictional member fixtures to carry
  the tested member's own credential. Keep all refusal assertions. Add 13 adapter
  regressions across all six paths: bind before business SQL, fail before business
  SQL on refused binding, and keep credentials out of principal JSON.
- No SQL body, manifest or migration proof was changed in this repair; therefore
  no routine was re-created from an older main body. Main-body catch-up,
  classification of later routines and renumbering remain the router's later
  link-by-link chain work. Existing refusal suites and all named holds remain.
  The old pending-index hold below is historical: the supplied starting branch
  was clean at `cdd4e3282`; this sandbox performs no Git-writing operation.

Executed locally using installed runners, at most two workers:

- `packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2 test/lp6d-repository-context.test.ts test/lp6d-routines.test.ts src/recovery-legacy-later.test.ts`
  — **40 passed**, three files.
- `packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts --maxWorkers=2 apps/api/src/contractor/contractor.projection.test.ts apps/api/src/contractor/work-order.application.test.ts apps/api/src/workspace/fee-illustration-later.test.ts`
  — **49 passed**, three files.
- Installed `node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit`
  for `packages/db`, `apps/api` and `apps/web` — **passed** (also each affected
  package's lint script).
- `LANE_BASE_REF=531e7d633 node tools/lint.mjs` — **passed** after selecting
  this serial link's actual branch base; default origin/main includes predecessor
  work and is not this link's lane range. `git diff --check` — **passed**.
- The default pnpm launcher could not verify/start pinned pnpm 10.28.1 through
  the restricted registry. No install was performed; the installed TypeScript
  and Vitest entry points above ran the real checks directly.

CI must prove the full required suites, especially real-PostgreSQL
`fee-illustration-later.integration.test.ts`,
`contractor-full-demo-package.integration.test.ts`,
`contractor-parties.integration.test.ts`, `contractor.integration.test.ts`,
`work-order-import.integration.test.ts`, `work-order-concurrency.integration.test.ts`,
`sor-pricing.integration.test.ts`, `recovery-legacy-later.integration.test.ts`,
and `lp6d-routines.integration.test.ts`; fresh/upgrade/repeat migrations,
LP-0 catalogue/ACL/RLS/proof validation, and the two phone/desktop demos.
No PostgreSQL or browser was started here. The inherited demo-bootstrap,
customer-message and source-pin holds are not repaired or waived by this round.
An exact-head independent RED check and green CI remain required before landing.


4 November chain update onto supplied LP-6c `531e7d6339e483add1989d47765140c700ec716e`
(the pending MERGE_HEAD). READY for the router's held NOPR branch save. This is
source-built work, not database execution, independent review or landing approval.
No Git-writing command, fetch, PostgreSQL or browser service was run here.

## Changes and closed predecessor assumptions

- Keep reserved migration **0780** and its additive proof. It avoids the existing
  0526 commercial-integrity migration. Do not restore its historical number.
- Retain LP-6c's 28 actual replacements byte-for-byte and reuse its five owner-only
  binding/accessor grants. LP-6d does not recreate any of those exact signatures;
  the local regression checks disjointness. `final_lock_require_owner`, command
  begin/effect/completion, and LP-3's old/new money ports remain LP-6c's copies.
- Start the session helper from LP-6b's latest **0584** body, preserving the base
  owner's active/revocation checks while switched. Change only its contractor
  projection edge to the existing private LP-6d projection, avoiding recursive
  binding. The proof chains the exact 0584 record to that new call edge.
- The routine manifest now records **117** exact predecessor overloads. Add early
  checks before their original initializers, business locks, mutations or replays.
  Preserve CH4's 0380 resume/admission and 0539/0547 source-writer amendments,
  0548/0549 entitlement/operative/invitation rules, signatures and search paths.
- Close the old broad sibling-coverage assumption for the remaining draft,
  historical landing, credit/receipt, fee-source, supplier-credit, success-fee,
  value and Final Check helper ports that LP-6c did not replace. Derived practice
  principals are compared with the protected actor before their source reads.
  Other meter/mandate/contractor paths reuse the bound `mon1_company_actor`,
  contractor session or Final Check chokepoints; classification is not execution
  evidence. The lifecycle invoker helper is preserved, using LP-6c's existing
  bridge rather than inventing accessor grants for the meter role.
- `mon9_session` is now present: guard it and both election overloads. The older
  election remains private. A supplied real credential must agree with the
  established binding, in addition to its existing owner/session checks.
- Cover the newly inherited supervisor query, work-status, proceed-comparison,
  WORM submit, billability snapshot/command, money-trail and reconciliation ports.
  WORM's payload actor and billability's derived actor must match the binding.
  The SQL work-status reader retains its query and STABLE contract inside a
  guarded PL/pgSQL body. No new commercial permission is introduced.
- Entitlement's subject member remains separate from request identity: the base
  owner may be the subject of a switched session's company-entitlement check.
  Both entitlement and site-authority subject checks require a protected request;
  business entry points still check their own exact actor and decided permission.
- Preserve the checked recovery-message authorization revocation routine/caller;
  direct runtime UPDATE on `action_authorization.revoked_at` stays withdrawn.
  `apply_recovery_timeline_signal(uuid,jsonb)` stays unavailable to runtime pending
  LP-10 worker authority. Unconditional disabled historical ports remain disabled.
- Resolve the entitlement upgrade test conflict, retaining incoming LP-6c/current
  main assertions and its exact dispatcher exception, then add exact expectations
  for all **123** LP-6d definitions. No catalogue/body guard was weakened.
- The lane contains exactly the nine non-lane file-content changes from the supplied
  predecessor. Inherited LP-6b/c files are preserved, not added to LP-6d's lane.

## Actual local verification

Installed dependencies only; no downloads. Every Vitest run used one worker and
at most three named files. At most two local commands overlapped.

- From repository root: `./packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=1 test/lp6d-routines.test.ts test/lp6c-money-routines.test.ts test/migration-proof-loader.test.ts`:
  **3 files / 91 tests PASS**. This includes exact latest-overload preservation,
  the LP-6b helper's exact single-edge change, source/actor checks, disjointness
  from LP-6c, classification and strict proof loading.
- Same installed runner/options: `test/recovery-message-repository.test.ts`,
  `test/lp6b-withtenant.test.ts`, `test/contractor-session-context.test.ts`:
  **3 files / 55 tests PASS** (service doubles, not PostgreSQL proof).
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- Installed TypeScript transpilation of both affected integration tests: PASS
  (syntax only, not execution or typechecking of database test behavior).
- Exact definition/signature order comparison for the upgrade test: **123 PASS**.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 248 migrations checked.
- `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`
  and `git diff --check`: PASS.
- Read-only endpoint comparison against MERGE_HEAD: the lane's nine paths match.
- Real lane guard with the predecessor base: **FAIL**, because its Git-based view
  still includes the pending merge/index and inherited paths; output is at
  `/tmp/lp6d-chain-lane-check.log`. No substitute lane PASS is claimed.
- `node tools/commercial-integrity-current-source-guard.mjs`: **FAIL**, inherited
  `practice-session.ts` unresolved-case fingerprint mismatch, detailed below.

## Named holds for landing

1. **Customer-message credential design (router ruling):** 0547's
   `identity.customer_portal_message` calls `app.sv7a_intake_job_source` using a
   customer credential and grant sponsor. Member binding and LP-6c's command
   boundary do not establish that customer principal. Keep the writer held;
   design its separate customer sign-in proof after LP-6b lands. No sponsor
   impersonation, new binding kind, caller-setting bypass or weakened guard here.
2. **Protected source-guard follow-through, inherited from LP-6b:**
   `tools/commercial-integrity-current-source-guard.unresolved.json` records
   `packages/db/src/practice-session.ts:73`, `UNRESOLVED_COVERED_EDGE`, old
   fingerprint `ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca`,
   reason `Generic local query helper receives runtime sql/values parameters; callers are not specialized by runtime data flow.`
   Current output is line **75**, dependency `unknown query text/structure`, new
   fingerprint `a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04`.
   The tool reports ten covered-edge diagnostics plus the one stale baseline.
   Both the source and guard file exactly match MERGE_HEAD. Their authorized
   owner must resolve the edge or review the exact old/new expectation change;
   LP-6d does not edit the scanner, source pin or guard.
3. **Router Git completion and actual lane check:** conflict markers are resolved
   in the working file, but the entitlement test remains unmerged in the read-only
   index. Router stages resolutions, completes the pending predecessor merge,
   saves this NOPR branch and reruns the actual lane guard. No Git completion,
   predecessor landing or lane PASS is inferred from matching working files.
4. **CI and exact-head independent security checks:** run the full real PostgreSQL
   suite, fresh/upgrade/repeat migrations, LP-0 catalogue/grants/owners/RLS, proof
   ACLs, exact source preservation, all old/new/private overload attacks and
   permitted contractor/member flows. New integration cases cover forged actor,
   wrong tenant/GUC, unbound/private signatures, substituted credentials, base-owner
   revocation while switched, WORM payload actors, operative command replay,
   supervisor reads/refusals, invitations, sync identity and revocation. Also run
   normal required typecheck/lint/test/build and applicable browser suites.
   LP-6e still owns trusted audit attribution; LP-10 owns separate worker authority.
   Customer-message compatibility needs hold 1's proof before landing.
5. **Migration reservation:** retain 0780 with its exact proof; router reconfirms
   its free landing position and predecessor order before opening the LP PR.

The absence-only predecessor, stale migration-path, missing MON-9 and broad
sibling-ownership holds are closed by this update. Database behavior and
independent security review remain unproved here; the branch stays held NOPR.

LATER / SIMPLICITY (initial source review): repeated routine bodies could eventually
use exact-signature, asserted guard insertion with source/configuration preservation
proofs. That would reduce maintenance drift; it is future work, never a gate bypass.
This catch-up retains the established explicit-copy pattern and adds exact latest-
body regression coverage rather than introducing another runtime abstraction.

Forward-fix only. No policy, approval, history, table fingerprint or function SET
app.* contract is relaxed. No live provider, real data, money, release or main push.
