# 1053 readiness timezone case — LATER-SAFETY-32

Forward migration after 1052_readiness_bad_timezone, copied from that complete
latest routine. The only SQL change is the EXISTS predicate:
`lower(zone.name)=lower(latest.payload->>'timeZone')`. Confirmed plans with
case variants accepted by the existing validator and PostgreSQL are discoverable.
Unknown names still take CASE's false branch without evaluating AT TIME ZONE.

Preserves the signature, synthetic-database guard, latest-revision selection,
date comparison, 100-row cap, identifier-only output, SECURITY DEFINER/search_path,
owner, REVOKE/GRANT, per-tenant context under FORCE RLS, and context restoration
on normal exit and error. No table, policy, grant, signature or stored data
changes; the explicit lp0/upgrade/tenancy proof sections are empty because those
tracked catalog attributes are unchanged. No backfill or external actions.
Forward fix only: retain plans and add another reviewed migration if needed.

Four added real-PostgreSQL cases use the existing fixture/store helpers. Each
of europe/london, EUROPE/LONDON and utc is confirmed through the real store;
the test installs 1052 and checks exclusion, restores 1053 in finally, then
requires discovery. The fourth seeds an unknown latest revision alongside a
confirmed valid plan in the same tenant/job and requires only the valid identity.
All seven predecessor timer cases are byte-for-byte unchanged.

Local evidence:
- Node v24.17.0; existing pinned installed binaries, no package downloads.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: passed.
- Built existing core/storage dependencies with their installed tsc for Vitest
  imports; generated ignored dist output only.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts`: 77 tests passed.
- From packages/db: `./node_modules/.bin/vitest list --maxWorkers=2
  test/readiness-timer.integration.test.ts test/readiness-store.integration.test.ts`:
  collected all 11 timer and four store cases; no database hooks executed.
- SQL byte comparison: exactly the requested predicate replacement from 1052.
- `git diff --check`: passed. Exact lane allow-list, unchanged original timer
  source and migration ordering checks passed using the lane tool exports and
  read-only Git diffs; only the five allowed files changed.
- The pnpm version wrapper stalled; direct installed binaries completed checks.

Named holds for landing:
- NOPR: land after later-safety-29, later-safety-20 and batch-44. HEAD already
  equals origin/codex/sandbox/later-safety-29 at fa9e9832dff4eeb8f7ec35dfdbcd9c2d34e6aa7d;
  no merge or other Git write was run in this read-only Git sandbox.
- Renumber complete migration filename stems only, preserving 1050 < 1051 <
  1052 < 1053. The existing timer tests reapply 1051 and 1052 by filename;
  those cases are unchanged. New tests also name 1052/1053 and restore 1053.
  They temporarily replace a global routine; keep these cases sequential.
- CI must run all readiness-timer cases against real PostgreSQL, including
  failing-first assertions, and readiness-store integration. Database execution
  was not attempted here: this sandbox cannot start PostgreSQL/bind localhost.
  CI must also prove fresh/upgrade migrations, LP-0/privileges, tenancy and the
  required project checks. No scanner or pin edit was made.
- `LANE_BASE_REF=origin/codex/sandbox/later-safety-29 node
  tools/agent-lane-boundary-lint.mjs` refused the base-equals-HEAD comparison
  before checking working files. Run the full lane gate after the router commits;
  no scanner changes or broader lane permissions were made.
- Independent check at the exact landing head is required for the SECURITY
  DEFINER replacement, although this synthetic discovery piece is not RED.

READY for router commit and CI; not a database PASS or independent-review claim.
