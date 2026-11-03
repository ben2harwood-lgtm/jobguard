# 0567 — SV-5 disclosure terms at lock insertion

The command already checks acceptance. A BEFORE INSERT trigger now also requires an acceptance for the lock tenant and exact onboarding terms version, recorded no later than locked_at. The trigger reads no shadow data and grants no callable runtime privilege. Existing immutable locks are unchanged; no backfill or data migration is performed.

The database regression attempts privileged direct insertion without that tenant's acceptance and with acceptance later than the claimed lock time. It also checks the normal accepted command still succeeds. The existing foreign-key negative fixture now accepts terms first so it reaches the intended key constraint.

Run the full PostgreSQL and migration suites in CI, plus SV-5 browser journeys in both projects. These cannot run in the issued sandbox. Forward-fix with a later replacement function; do not rewrite historical locks or remove accepted terms. RED independent review remains required.

## Migration proof catch-up (1 November 2026)

The proof declares the owner-only trigger routine with its exact ACL, owner, SECURITY DEFINER flag and search path, plus the LP-0 protection record and INSERT trigger. No effective capability is added: the routine has the app schema owner and no non-owner EXECUTE grant. Its definition hash is calculated from SQL using PostgreSQL's canonical function-definition format, corroborated against the committed guard_final_check_generated_fact digest without querying a database.

No tables, relations, policies, historical rows or tenancy expectations change; no RLS-off exception is declared. The shared LP-0 inventory, upgrade test and tenancy test already match fetched main. Migration bytes and numbering are unchanged. No unmerged sibling proof is needed by 0567: its terms and lock tables are on fetched main. Main's missing proof for 0510_read_value_job_combined_final.sql remains outside this piece, pending #502.

Local validation: core and storage TypeScript builds and `tsc -p packages/db/tsconfig.json --noEmit` passed. The actual DB Vitest runner, with one worker, ran `test/migration-proof-loader.test.ts` and `test/upgrade-proof-utils.test.ts`: 28 passed, one failed only because main's 0510 proof is absent. An isolated source-import check of this proof passed strict schema parsing, LP-0 combination, exact upgrade application and unchanged tenancy. `git diff --check` passed. PostgreSQL/browser suites remain for GitHub CI; no database facts were used to author the proof. Initial test discovery required the existing core/storage builds; the temporary validation script used the tsx import loader because its CLI's IPC listener is unavailable in this sandbox.
