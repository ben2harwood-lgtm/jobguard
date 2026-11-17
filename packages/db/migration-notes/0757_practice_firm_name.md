# REAL-PRACTICE-FIRM-NAME-CATCHUP — 0751

RED: practice namespace isolation, runtime definer authority and immutable quote sends.
Catch-up only against origin/main f4016e96798c5c18b23a0d5ba2d1bf431500d963;
the router prepared this merge from PASS head 9b610d867. No new product behavior.

0750 is reserved for real-wayin-linked-practice-web #791; 0751 was free.
Renamed the migration and proof by exact stem to 0757_practice_firm_name.
No pre-existing migration note was present; this is its landing note.
The SQL is byte-identical to HEAD's placeholder migration (SHA-256
3efdb8c33c3965fabff57fc4f5409b6cd06425d552f2545600f4d0e25526dce6).
Its historical numeric comment is retained to honor byte identity; all executable
migration references and proof paths use 0751. The lane retains old paths and
adds the new paths and catch-up consumers.

Case-insensitive CREATE FUNCTION name comparison with 0749 found no overlap:
0751 defines app.current_firm_profile_key and app.job_saved_firm_name, neither
of which 0749 defines. No LP6D prefix or 0749 body is changed. Both 0751 bodies
are registered in migfix-7 and plan-entitlement successor lists. Both runtime
definers have Reviewed 0751 reasons in lp6d-runtime-classification.json.

The quote conflict keeps main's allocated company reference, reference-specific
preview reuse, accepted-document projection and #768 hash/recipient replay check.
One existing mutation lock callback performs the replay and issuer checks before
receipt reuse. New sends reject a changed issuer; matching existing sends replay
their immutable artifact after a rename. Existing test expectations are unchanged;
additional PG assertions reject changed hash/recipient replays after rename.

No rows, profiles, documents, approvals or existing routine ACLs are rewritten.
The existing SELECT-only bound-reader policy remains; no new grant or policy was
added by this catch-up. Forward fix replaces the routines in a later migration,
retaining profiles and immutable documents.

Local evidence (installed Vitest 4.1.12, maxWorkers=1 for each run):

- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=1 test/lp6d-routines.test.ts test/lp6d-repository-context.test.ts — 57 passed.
- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts test/upgrade-proof-utils.test.ts — 81 passed.
- From apps/web: ./node_modules/.bin/vitest run --maxWorkers=1 app/firm-details/firm-details.test.tsx app/ui/quote-editor-slots.test.tsx — 16 passed.
- From packages/db and apps/web: ./node_modules/.bin/tsc -p tsconfig.json --noEmit — passed.
- git diff --check; SQL byte comparison and overlap/conflict-marker checks — passed.

The pnpm wrapper attempts stalled after a configuration warning and were stopped;
checks then ran via the installed package-local executables without downloads.
PostgreSQL and browser tests were not run: this sandbox cannot start PG or bind
localhost. Router/checker commands, from the repository root, in CI:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-firm-name.integration.test.ts test/firm-profile.integration.test.ts test/real-quote-firm-sequence.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp6d-routines.integration.test.ts
pnpm --filter @jobguard/web test:e2e --workers=2 --project=mobile-360 --project=desktop real-practice-firm-name.spec.ts real-quote-firm-sequence-server.spec.ts real-quote-firm-sequence-screen.spec.ts
```

Full required CI and an independent RED review at the committed head remain
landing gates. This is NOPR; the router stages the resolved merge, commits and
pushes. Git metadata was left read-only, including its unmerged index entries.
