# LP-6d remaining routines — RED, NOPR, held for landing

4 November catch-up onto the supplied LP-6c merge. READY for the router to save
as a held NOPR branch under the 4 November ruling; implementation remains partial.
This is not acceptance, independent review, or permission to land. No git-writing
command or fetch was run. The two conflicted LP-0 files contain LP-6c's exact
copies; the read-only index still needs the router to record their resolution
and complete the predecessor merge. The named landing holds below remain open.

## Changes within LP-6d

- Renumbered this branch's unlanded migration to 0780, avoiding the merged 0526
  commercial-integrity migration. Added its strict migration proof rather than
  editing the predecessor's frozen LP-0 inventory or historical proofs.
- Refreshed copied definitions from the latest CREATE on this supplied branch.
  The 90 signatures and exact predecessor paths are in `test/lp6d-routines.json`.
  Retained 0380's CH4 admission/resume amendment and 0539/0547's later source-writer
  amendments, including practice diary admission and customer-message provenance.
  Kept 0548/0549's contractor entitlement and operative-role guards, including the
  latest invitation body. Retained existing signatures, volatility and search paths.
- Removed `final_lock_require_owner` from LP-6d: LP-6c already owns that helper.
  This fixes the predecessor body's regression test without changing that test.
- Added 17 later evidence/source, integrity, historical-import, baseline, accounting
  export and sync routines. Sync checks the supplied user against the bound
  membership's identity, with an allowed checkpoint and substitution regression.
- Kept the private switched-practice projection and checked invitation bridge;
  contractor UUID credentials now take the contractor actor comparison instead of
  being passed to the home-practice authenticator. This preserves company reads.
- Kept the existing narrow recovery-message revocation routine/caller change.
  The proof removes direct runtime UPDATE on authorization.revoked_at, records
  both new private/checked routine owners and the exact checked EXECUTE grant.
- Explicitly revoked runtime access to `apply_recovery_timeline_signal(uuid,jsonb)`.
  It is a named unavailable worker entry point pending LP-10's distinct worker
  authority, not a callable path deferred by an assignment label. Its body and
  owner stay unchanged. The now-empty capability group/path are removed through
  the additive proof; the historical baseline retains their evidence.
- Extended the exact-overload successor expectations in the entitlement upgrade
  test. These compare installed bodies with the named LP-6d definitions; no
  wildcard, catalogue/body guard relaxation, scanner edit or pin refresh was made.
- The lane lists exactly the nine non-lane endpoint changes from the supplied
  LP-6c branch, including the new migration, note, proof and upgrade test.

## Stop: wider credential/command contract work is required

**Landing held:** `identity.customer_portal_message` in migration 0547 calls
`app.sv7a_intake_job_source` using a customer credential and the grant sponsor.
The retained LP-6d intake guard requires `app.current_actor()` before its body.
`app.bind_request` (0562) supports only real, practice and contractor_practice
member credentials; it does not establish a customer principal. LP-6c's
`app.begin_command` also compares the command actor with the member binding.
Thus preserving the latest customer source body is necessary but does not prove
that this legitimate customer path survives the combined cutover.

The wider edit would be to introduce a reviewed customer principal/delegation
contract across LP-6b's binding bridges and LP-6c's shared command boundary, or an
explicitly reviewed private customer command path. Do not invent a customer-to-
builder impersonation, weaken current_actor/begin_command, add a setting-based
bypass, or silently revoke the legitimate customer workflow to claim completion.
This session stops short of that wider edit under the brief's scope limit.

## Split and predecessor assumptions

LP-6c exclusively owns money/activation/acceptance/invoice paths, financial and
entitlement readers, `mon1_company_actor`, `begin_command`, `complete_command`,
`lp5_bind_effect`, and `final_lock_require_owner`. In particular the later
platform statement/collection/simulation paths, MON-3 activation, MON-8 entitlement
helpers, value/meter readers and M4-13 mandate routines are explicitly classified
as LP-6c and were not reimplemented here. Their direct and transitive binding
coverage must be established by that predecessor's owner; a classification label
is not execution evidence. LP-6b repair remains separately owned, not reproduced.
LP-6e owns audit attribution; LP-10 owns worker authority. `app.mon9_session` is
absent on this supplied branch and the no-fallback catalogue test must detect it
if it arrives. No sibling's routine was relabelled as implemented by this piece.

## Actual local verification

Dependencies were already installed; nothing was downloaded. Global pnpm did not
advance beyond its configuration warning and was interrupted. Used the installed
project runner directly, with at most two workers and three named files per run.
After building the existing core dependency with the installed tsc, the final run:

`cd packages/db && ./node_modules/.bin/vitest run --maxWorkers=2 test/lp6d-routines.test.ts test/lp6c-money-routines.test.ts test/migration-proof-loader.test.ts`

**PASS: 3 files, 87 tests** (`/tmp/lp6d-final-unit.log`). Earlier failures exposed
stale dependency output, the duplicate migration number, stale predecessor paths,
the LP-6c helper overlap, missing later classification and an empty withdrawn
capability group; none was skipped or weakened.

`./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: **PASS**.
TypeScript transpile diagnostics for both changed integration files: **PASS**.
`git diff --check`: **PASS**.

`node tools/agent-lane-boundary-lint.mjs`, also with
`LANE_BASE_REF=origin/codex/sandbox/lp-6c-money-routines`: **FAIL**. The normal tool
includes the unfinished merge/index changes and historical merge-base range,
including predecessor files and the old paths being renamed. Its result is not
claimed as a pass. A separate read-only endpoint comparison plus untracked files
matches the lane's nine explicit non-lane paths exactly. Router must stage/finish
the authorized predecessor merge and rerun the real lane guard once ready; do not
widen the lane to all inherited files.

PostgreSQL and browser suites were not run: this sandbox cannot start PostgreSQL
or bind localhost. No live provider, real data, money, CI, merge or release used.
CI must prove the whole PostgreSQL/migration suite (fresh/upgrade, exact grants,
RLS/owners, source preservation, new proof ACLs, catalogue classification), all
bound/forged/replayed/cross-tenant and allowed operative/invitation/switch paths,
worker unavailability, recovery-message revocation, customer-message compatibility
once the upstream contract is resolved, and applicable browser/normal gates.
One independent RED review plus the required second security check at the exact
head remain required before landing, after LP-6b and LP-6c are in.

LATER / SIMPLICITY (initial source review): this migration repeats large routine
bodies. Consider a future exact-signature, asserted in-place guard insertion that
preserves installed prosrc and configuration, with catalogue/source proofs. This
would reduce maintenance drift from later body amendments; it is not a blocker or
an authorization to replace the established implementation in this catch-up.

Forward-fix only: change a checked routine or credential contract in an authorized
new migration; never restore direct authority writes or trust caller settings.
No fingerprinted-table columns or function SET app.* clauses were introduced.

## 4 November no-PR save verification

The focused installed Vitest run above was repeated: **3 files, 87 tests passed**,
with `--maxWorkers=2`. DB `tsc --noEmit` and `git diff --check` passed again.
Read-only comparison against MERGE_HEAD `cebbbe2a86c0cb1203b80238419aa771ec8f0c6e`
confirmed both LP-0 working files exactly match that predecessor. Their index
entries remain unmerged because this sandbox cannot write Git metadata.

The real lane guard still fails on the unresolved merge/index and inherited
paths; output is saved at `/tmp/lp6d-save-lane-check.log`. The lane was not widened.
No scanner, protected pin, guard, test or implementation was changed in this save
pass. No specific old/new protected pin values were identified in the prior
handoff; LP-6b's authorized owner must supply any required exact values.

LP-6c is present as the pending merge, not proven landed; LP-6b repair and its
prerequisites remain external landing dependencies. The customer credential
contract, sibling coverage, absent `app.mon9_session`, worker authority, exact-head
security checks and real PostgreSQL/browser/CI gates above remain held. Router
commit-message handoff lists these points for saving and subsequent landing.
