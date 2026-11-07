Recovery timeline writes now trust only anchored imports.

LATER-SAFETY-137-CATCHUP — READY for router commit and CI (RED: practice-session/job authorization).

Landing prep preserves the exact union with origin/main 03f3f3926. Renumbered
0955 to reserved 0694 by stem only, including its proof, this note, the regression
reference and lane paths. Applied both rows from the supplied landing-holds diff
using 0694; retained main's additional 0667/0670 upgrade-list entries. The routine
is byte-for-byte main's latest 0506 body plus the reviewed 0660 import-anchor
predicate, with CREATE OR REPLACE and the transaction wrapper. Existing ownership,
search path and EXECUTE grants are preserved; no new runtime power is granted.

Local verification (Node 24.17.0; installed tools, no downloads):
- packages/db: ./node_modules/.bin/vitest run --maxWorkers=2 test/lp-0-catalog.test.ts test/migration-proof-loader.test.ts test/later-safety-catalog.test.ts — PASS, 111 tests in 3 files.
- packages/db: ./node_modules/.bin/vitest run --maxWorkers=1 test/recovery-timeline-import-anchor.integration.test.ts -t 'copies the prior routine' — PASS, 1 source-copy test; 4 PostgreSQL tests skipped by the filter.
- packages/db: ./node_modules/.bin/tsc -p tsconfig.json --noEmit — PASS.
- Read-only comparison against origin/main's latest routine body — PASS.
- git diff --check and exact lane coverage of final paths against origin/main — PASS.

NOT RUN locally: PostgreSQL LP0-17, live catalog/grant-freeze, both upgrade suites,
and the four behavioral import-anchor tests. The sandbox cannot start PostgreSQL
or bind localhost. Required CI commands (from packages/db, at most 2 workers):
- ./node_modules/.bin/vitest run --maxWorkers=2 test/lp-0-authority-paths.integration.test.ts test/lp-0-grant-freeze.integration.test.ts
- ./node_modules/.bin/vitest run --maxWorkers=2 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/recovery-timeline-import-anchor.integration.test.ts

Router must run the official lane check after staging/committing the rename;
its local HEAD-based scan still sees the superseded 0955 paths until then.
Independent RED review at the resulting exact head and green required CI remain
merge gates. No database execution, commit, push, merge, release or deployment
is claimed. No rollback change: any further correction is a forward migration.
