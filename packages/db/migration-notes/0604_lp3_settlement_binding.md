# LP-3 settlement binding — 2 November 2026

READY for router commit; RED (permissions/money), NOPR=1. Depends on #414;
land after it and renumber only migration filename stems if needed. Independent
review at the exact head and green current-main CI remain required.

The checked 0519 settlement routine supplied the authorization row's own
content_hash as the expected hash. Migration 0604 recreates its latest body and
instead supplies the independently reconstructed LP-3 payload hash. The only
routine-body change is that expected-hash argument. It preserves locks, tenant
and active-owner checks, processing receipt, approved Decision/resolution,
wall-clock expiry, one-use approval, duplicate settlement refusal and atomicity.
The owner-only legacy overload and v1/v3 activation routes remain unchanged.

Issuing-path inspection: UserCommandDispatcher.dispatch inserts
command.action.contentHash verbatim into action_authorization. The only existing
settlement command issuers are the activation and LP-3 test journeys; they used
arbitrary fixture/document hashes. They now supply lp3MutationHash, the existing
length-prefixed UTF-8 codec already reconstructed in SQL. It binds tenant,
actor, obligation, provider event, amount, GBP, illustrative policy and exact
millisecond timestamp. Generated settlement IDs remain outside semantic replay
identity. The mutation checks the same content hash and the subject, revision
and recipient already required by SQL. No new codec or approval mechanism.
Previously arbitrary hashes fail closed; callers must issue a fresh exact
approval. No existing approval or commercial history is rewritten.

The proof has explicit empty lp0, upgrade and tenancy arrays: this replaces an
existing body with unchanged identity, owner, ACL, definer, search path, tables,
policies and historical rows. LP-0 definition digests remain recorded historical
facts, not compared under its existing Q2 hold; this change does not modify that
gate or baseline. The existing LP-3 upgrade test applies the discovered migration
registry twice and checks populated historical commercial rows remain unchanged.
Forward fix only: retain 0604; correct a defect with another reviewed migration,
never restore the self-comparison. No backfill, operational alert or live action.

Regression coverage: direct runtime SQL bypasses mutation prechecks and refuses
an approval hash for another real obligation, another amount (even when approval
amount metadata is 7900), arbitrary/zero/document hashes, altered event/time,
wrong tenant/actor/policy, revoked and expired authorization. Rejected operations
leave settlement, consumption, receipt, approval, journal and audit counts intact.
Coverage also checks rollback/retry, concurrent duplicate command replay,
competing commands for one obligation, canonical SQL/TypeScript agreement and
the earlier v1/v3 journeys. These database tests were written and typechecked,
not executed in this sandbox.

Local checks with installed Node 24.17.0, TypeScript and Vitest 4.1.12:

- Built existing core and storage dependency outputs using each package's
  ./node_modules/.bin/tsc -p tsconfig.json; no downloads or dependency edits.
- From packages/db, ./node_modules/.bin/tsc -p tsconfig.json --noEmit: PASS.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=2
  src/lp3-operation.test.ts src/lp3-mutations.test.ts
  test/migration-proof-loader.test.ts: 85 passed.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=2
  test/lp-0-catalog.test.ts: 30 passed.
- Semantic TypeScript check of both changed integration files via a temporary
  config extending the repository strict config: PASS.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF
  lints: PASS. Core purity reports existing computed-import notices.

The initial Vitest invocation failed package resolution because core/storage dist
outputs were absent; the same three-file invocation passed after building them.
The normal lane CLI compares with main and includes #414's inherited changes;
it refuses those outside this new piece's lane. Comparing with the issued remote
base also includes two inherited inbox-gateway changes. No lane was broadened
to permit prerequisite edits. Working-change-only validation against this lane,
migration order against HEAD, exact 0519 body preservation apart from the hash
argument, and git diff --check: PASS.

PostgreSQL, full migration suites and browser journeys were not run: the issued
sandbox cannot start PostgreSQL or bind localhost. CI must run the whole RED
PostgreSQL suite, upgrade/fresh install checks and journeys after router push.
No Git write, fetch, push, PR, provider, real customer data or paid call occurred.
G0–G5 remain closed; no independent-review or live-integration claim is made.
