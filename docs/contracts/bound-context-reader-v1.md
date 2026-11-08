# Bound context reader v1

PROPOSAL, NEEDS BEN. Plan piece `bound-context-reader` is RED because it crosses the request-binding security boundary. Landing requires Ben's typed yes, green PostgreSQL CI and independent review against the exact head. Migration `0956` is a placeholder for router reservation at landing.

## Interface and authority

`app.bound_context_reader() RETURNS jsonb` returns exactly `{"actor_id":"<uuid>","tenant_id":"<uuid>"}` from the current transaction's validated binding. SQL NULL represents an unbound or expired request. The pair uses named fields so a caller can explicitly compare both identities with its subject and command inputs.

The function runs as `jobguard_binding_owner` with fixed `search_path=pg_catalog,pg_temp`. Its only application call is the existing private `app.lp6_bound_request()`. That accessor selects the current environment and transaction and checks the binding expiry. The reader converts only its `42501 REQUEST_BINDING_REFUSED` exception to SQL NULL. Other errors propagate. Lookup never accepts a transaction, environment, credential, actor or tenant parameter.

EXECUTE belongs to the owner and `jobguard_migration` only. Runtime, identity, infrastructure, PUBLIC and unrelated logins have no execution grant. The migration role continues to lack execution on `current_actor`, `current_tenant`, `lp6_bound_request` and `bind_request`, and lacks direct binding-table access. Administrative provisioning supplies temporary ownership-transfer membership, then removes it through the existing provisioner. The migration restores the binding owner's schema CREATE privilege to its prior absent state.

A migration-owned SECURITY DEFINER caller can read the pair for its own request. Its caller must still validate membership, permissions, subject identity, command revision and exact commercial authorization as applicable. A NULL result must fail closed wherever binding is required. Conversion of LS-134, DEMO-S-FC-COMPANY-DB and supplementary invoice callers belongs to their separate pieces.

## Threat boundary

The helper reads binding state established by credential validation. It grants no binding mutation or credential resolution authority. Caller-controlled settings supply no identity. Concurrent requests, subsequent transactions and reused pooled connections use their own transaction lookup. An expired row remains stored and yields NULL.

The database administrator and anyone able to alter migration-owned routines remain privileged actors under the existing trust model. Adding an approved migration-owned caller that exposes data or writes business state requires its own authorization review.

## Evidence and handoff

The migration is additive and transactional, with no data backfill or existing caller changes. A failed application rolls back the function and temporary schema grant together. Before any downstream caller adoption, an administrator can withdraw this proposal by dropping only `app.bound_context_reader()` without CASCADE; dependencies must block withdrawal. After adoption, forward-fix or revert the dependent callers first. Existing binding state and accessors are unchanged.

The integration suite covers exact pairs through a test-only migration-owned definer, concurrent request isolation, commit and rollback reuse, unbound and expired NULL results, settings and invalid-credential forgery, rebind refusal, private-store/accessor denial and execution denial for runtime, identity, infrastructure and unrelated login roles. The proof fragment adds exactly the helper's owner and migration EXECUTE allowance, its LP0 authority path and recorded protection facts, and the migfix-7 successor routine metadata row. The definition hash awaits PostgreSQL catalogue capture.

READY for router proposal handoff. The return representation was chosen locally as JSONB with named UUID fields, keeping this change to one new routine.

Executed local checks on 8 November 2026, using the installed tools from this worktree.

- `./node_modules/.bin/vitest run --maxWorkers=2 test/bound-context-reader.test.ts test/migration-proof-loader.test.ts test/lp6a-binding.test.ts`, from `packages/db`, passed 3 files and 81 tests.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` passed.
- `vitest list --filesOnly test/bound-context-reader.integration.test.ts` discovered the new integration suite through the repository configuration.
- `node tools/plpgsql-case-in-if-lint.mjs` passed for 338 migrations.
- `LANE_BASE_REF=4ede1d35e node tools/lint.mjs` passed core purity, lane boundaries, money arithmetic boundaries and PL/pgSQL lint. This is the root static lint helper, not the full workspace `pnpm lint` suite.
- The lane allow list equals every branch-changed path outside `config/lanes/` (using the merge base with `origin/main`). Whitespace checks passed. This branch already contained proposal commit `f9e1f59fe` at session entry; no Git writes were performed. The router must reconcile current main before pushing.

Real PostgreSQL suites run in GitHub CI after the router pushes because this sandbox cannot start PostgreSQL or bind localhost. Required database checks include `bound-context-reader.integration.test.ts`, `lp-0-grant-freeze.integration.test.ts` and `migfix-7-upgrade.integration.test.ts`, with the normal migration suites. PostgreSQL execution, full CI, independent exact-head RED review and Ben's typed yes remain pending. The router owns commit and push. This is an NOPR proposal handoff.
