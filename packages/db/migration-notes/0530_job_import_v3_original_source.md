# CH-5 stage-end sweep: reject chained imports

RED. Synthetic data only. Migration 0566 replaces the checked invoiced-import
writer with the same definition plus one source-provenance guard after its source
row lock. An imported source raises IMPORT_ALREADY_ADOPTED before any write.
The application checks the same condition after ownership verification, including
preview and direct mutation. Reading an imported job and replaying its original
source command remain valid. No grants, tables, policies or historical rows change.
The complete function definition is repeated because PostgreSQL replaces a function
body as a unit; all existing authorization, insert-permit and idempotency checks
are retained. No new live admission, fees, providers or production behavior.

Already fixed on fetched main: CH-4.spec asserts the close reason and exact event
kind sequence. The invoiced import's meterResultRef is stored as the unique
meter_exclusion_id in the immutable app.job_import_v3 aggregate (0362), as described
in docs/contracts/job-import-v3.md. It refers to that zero-count exclusion, not a
live-meter computation. A targeted lookup regression now resolves the receipt's
reference to its same-tenant job/command/reason/count row; no second exclusion
store or rewritten historical receipts are needed.

Local scripted-transport regression fails before the guard and passes afterward.
PostgreSQL CI covers direct-writer denial, unchanged effects after chained attempts,
receipt replay, exclusion lookup, fresh migration install and upgrade preserving
existing import rows and writer owner/security/search_path/ACLs. Database/browser
execution is reserved for CI because this sandbox cannot start PostgreSQL or bind
localhost. Independent RED review and green CI remain required.

Forward fix: add a successor migration if necessary. Preserve the immutable imports
and their original receipts. Do not edit 0362 or rewrite old ownership/audit chains.

Migration proof: `0530_job_import_v3_original_source.proof.json` deliberately
contains empty lp0, upgrade and tenancy delta lists. Source comparison with 0362
shows only CREATE OR REPLACE and the source-provenance guard. The existing routine
keeps its signature, owner, ACL, SECURITY DEFINER, search_path, static calls and
static writes; its recorded definitionSha256 is null. Upgrade snapshots do not
include function bodies. No rows, relations, policies, triggers or tenancy tables
are added or changed, and no RLS-off exception is declared. All dependencies are
already on main; no sibling proof is needed for 0566. The three shared allowance
files match main exactly, and migration bytes and numbers are unchanged.

Proof-loader integration remains subject to main's missing proof for
0510_read_value_job_combined_final.sql until #502 lands. This branch does not
supply that unrelated proof or relax discovery.

Proof refresh local checks (1 Nov 2026):
- `./node_modules/.bin/vitest run --maxWorkers=1 test/job-import-v3.integration.test.ts -t 'CH5-P source-only'`
  from packages/db: 13 passed, 3 database tests skipped by name selection.
- `./node_modules/.bin/tsc -p tsconfig.json --noEmit` from
  packages/db: PASS.
- Storage build via root `./node_modules/.bin/tsc -p packages/storage/tsconfig.json`:
  PASS; required because the initial loader run could not resolve storage dist.
- `./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts`
  from packages/db after that build: 25 passed, 1 failed solely on missing main
  0510_read_value_job_combined_final.proof.json (known #502 dependency).
- Installed tsx with Node imported the actual proofSchema and applied 0566 to
  combineLp0, applyUpgradeProofs and both applyTenancyProofs projections: PASS,
  strictly parsed and unchanged outputs. No database facts were read.
- `git diff --check`: PASS. Byte comparisons confirm all three shared allowance
  files equal origin/main and 0566 SQL equals HEAD. The launcher's existing merge
  preserved this piece's source, SQL and regression files exactly.

READY for router NOPR commit. PostgreSQL fresh/upgrade and browser suites were not
run in this sandbox; green CI and independent RED review remain outstanding.
