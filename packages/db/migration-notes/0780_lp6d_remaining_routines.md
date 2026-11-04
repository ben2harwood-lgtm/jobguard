# LP-6d remaining routines — RED, NOPR, held for landing

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
