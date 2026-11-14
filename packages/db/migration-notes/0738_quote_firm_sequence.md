# real-quote-firm-sequence-db — RED dormant foundation

0738 is reserved for this piece; 0940 belongs to customer-link. Renumber SQL,
proof and these notes together at landing. No existing repository, route,
screen, approval or document is changed. NOPR=1; router commits/pushes. No stacking.

`app.allocate_quote_job_reference(job_id uuid) -> text` is the only runtime
entry point. Call it on the **same bound transaction/client**, immediately after
credential binding and **before every existing preview read**, including
`require_current_job_parties`, replay lookup and document-version selection.
The order is credential binding → firm advisory lock → job FOR UPDATE → counter
and assignment → existing preview work. The job lock prevents concurrent preview
lock upgrades and version collisions. Do not acquire a job/party lock first.

The routine derives the practice owner using the existing `practice-session.ts`
v3 import lineage and v1 succeeded-receipt/frozen-parties lineage. UNION
terminates cycles and deduplicates repeated paths. Missing or multiple owners
in either shared practice tenant fail closed. Ordinary companies use a separate
`company` namespace within their tenant; unowned shared practice jobs cannot
enter it. No ownership is assigned or rewritten.

A private boolean predicate, owned by `jobguard_binding_owner`, verifies tenant,
credential kind, lack of delegated scope and `session_ref = SHA256('lp6-home:' +
canonical ownership digest)`. Only the migration owner can execute that helper.
Neither `bound_context_reader` nor request-binding visibility changes. A linked
practice credential must establish that same canonical session_ref even when
its bearer credential differs. No linked-practice implementation is included.

Both business tables have tenant-qualified keys/FKs, FORCE RLS and no runtime
SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants. Allocation is a narrowly scoped
migration-owned SECURITY DEFINER routine with a fixed search path. An immutable
assignment trigger prevents update/deletion; a deferred constraint trigger
requires a matching persisted preview when its reservation commits. Thus an
allocator-only commit fails, and a failed preview rolls back both reservation
and counter advancement. Committed numbers remain reserved across lifecycle
changes. Transaction advisory locking serializes the first counter creation as
well as later increments. No sequence object, unlocked max-plus-one allocation,
gap filling or recycling is used.

Legacy artifacts are read, never backfilled or rewritten. On first assignment,
the latest document with a quote_send wins over every unsent preview, regardless
of a document's issued_at. Without a send, use the latest existing preview.
Legacy assignments are labelled separately so duplicate historical references
remain legal. The counter floor includes **every** numeric Q-reference in the
firm's unambiguous owned/imported jobs, including old and unsent previews; it is
reconciled on each previously unassigned job while old writers remain active.
The counter only increases. Fresh firms begin Q-0001; references grow beyond
four digits without truncation. Exhausting the 80-character reference fails
closed. Historical approvals can continue to reference older legacy previews.

The deferred trigger and recursive ownership resolver are the necessary extra
complexity: one enforces preview/reservation atomicity at commit; the other
preserves existing imported-job ownership without inventing a second identity.
No production route is activated and no existing quote operation gains a new
requirement before the integration successor lands. This foundation alone does
not change the visible Q-0001 behavior reported in the walks.

## Validation and handoff

The named PostgreSQL regression is `one practice firm reserves distinct job
references and retains them across revisions`. Setup installs the predecessor
schema, asserts that the runtime allocator call fails with undefined_function,
creates historical artifacts, then applies the migration with the normal
migrator. Runtime calls cover concurrency, replay, rollback, failed commits,
quote disposition, cross-owner/cross-tenant refusal, forged GUCs and wrong
credential kind. Upgrade checks compare full old artifact rows and rendered PDF
bytes/hashes and exercise the existing PDF download repository. Historical
import fixture setup uses administrative replication mode; allocator calls
always use the actual non-owner runtime login with guards enabled. The damaged
lineage test deliberately removes and restores only the v3 job-uniqueness
constraint to create ambiguity otherwise excluded by today's schema.

Local results and unavailable commands are recorded in the router commit-message
handback. No PostgreSQL, browser, catalogue or independent-review success is
claimed from source checks. Required on the exact committed head: the named
integration file, `pnpm test:db`, `pnpm test:migrations`, catalogue/grant checks
and current-main CI; use CI results for suites it covers. The independent RED
checker must use real PostgreSQL. Verify existing preview/download at 390 px;
there are no screen changes. Do not self-review, self-merge or release.

Forward fix only: stop use of the allocator if a successor has integrated it,
retain assignments/counters and immutable artifacts, then correct the controlled
routine in a later reviewed migration. Never reset counters or delete committed
reservations. D04 and G1–G5 remain closed; fictional practice data only. Firm
profile, customer linking, repository integration and the visible fix remain
successor work.

Local evidence (10 Nov 2026): Node v24.17.0 and cached pinned pnpm 10.28.1;
Vitest 4.1.12, explicit `--maxWorkers=1`. The global pnpm 11 wrapper tried a
network-dependent package-manager switch and failed; it was replaced for these
commands by `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
No download or package/settings change was made. Core and storage dependency
builds passed after the initial Vitest import reported absent built entrypoints.

- Cached pnpm `--filter @jobguard/db typecheck`: PASS.
- `node /tmp/quote-sequence-typecheck.cjs`: PASS, zero diagnostics in the new
  integration test (TypeScript compiler API; not a database execution).
- `node tools/lint.mjs`: PASS, including lane, money, commercial/provider and
  PL/pgSQL CASE-in-IF checks. Existing core computed-import notices are advisory.
- Cached pnpm `--filter @jobguard/db exec vitest run --maxWorkers=1
  test/m2-1-migration-proof.test.ts test/ais-migration-proof.test.ts
  test/migration-proof-loader.test.ts`: PASS, 3 files / 84 tests; includes strict
  discovery/schema validation and composition of the new proof.
- Cached pnpm `--filter @jobguard/db exec vitest run --maxWorkers=1
  test/real-quote-firm-sequence-db.integration.test.ts`: setup cannot bind a port
  (`no free port in 59000..59400`); runtime assertions were not executed.
- `git diff --check` and final lane boundary check: PASS. Exactly the five
  authorized new files are present. No git write command was run.

The source base is main's ae125e625a8387654aacd92082919a3c63c64587, which contains
73a411e8; it remains an ancestor of origin/main. Main advanced during this run.
The router must retain an unstacked current-main base and arrange CI/RED review
against the final committed head. Neither PostgreSQL's actual catalogue nor
390 px browser usability has been verified here.
