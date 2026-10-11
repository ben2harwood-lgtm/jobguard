# M0-6L builder run receipt — 2026-10-03

Builder: Codex. This is a run receipt, not an independent verdict or technical acceptance.
Branch: `codex/sandbox/m0-6l`. Uncommitted worktree from
`3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a`; the dispatcher must supply the resulting exact
commit to Claude and the separate accepting actor. No push, merge, PR, release, real send,
spending or decision approval was performed.

Implemented persisted entered-code challenges/sessions/invitations behind `AuthProvider`,
with a separate identity credential, strict versioned HTTP inputs, signup-owned tenants,
immutable email/tenant/role invitation grants, an authenticated principal bridge and secure
cookies. `/sign-in` reads persisted identity and current memberships on reload/deep link.
Next and Nest share `IdentityApplication`. Email is an in-process fixture transport only;
real addresses and non-synthetic delivery are blocked pending D04, with no live fallback.
Synthetic identity tokens retain their environment; the old demo cookie and synthetic
business composition are refused outside `synthetic_demo`. No Auth.js/mobile implementation
or commercial functionality was added.

The lane was the first working-tree change. Every previous lane is unchanged. Shared
registrations retain earlier entries and append the identity controller, global guard,
exports and navigation link. Compiled Nest initially exposed an erased Pool token in the
existing DecisionsController; the shared registration now explicitly injects Pool for that
controller so the new guard can boot in the actual compiled graph. Its business logic was
not changed. This registration fix is a declared composition overlap within this task.

## Commands actually run

Node: **24.17.0**. Final pnpm commands used the already cached **10.28.1** CLI via
`PATH=/private/tmp/jg-m0-6l-bin:$PATH`. That temporary launcher invokes
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` and downloads nothing.
The original global pnpm 11.8.0 launcher failed its network/version preflight; diagnostic
attempts with `--pm-on-fail=ignore` and configuration flags also failed or attempted an
automatic dependency refresh. No dependency installation completed and the generated
`.pnpm-store` artifact was removed. The pinned cached CLI was used for all final checks.

| Command / inspection | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | All seven packages; initial strict optional-property and web decorator-export errors (exit 2) were fixed and rerun |
| `pnpm build` | 0 | All seven packages, including production Next build and compiled Nest; repeated after final implementation changes |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Official lane check refuses HEAD equal to origin/main before the dispatcher commit; no policy weakened |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same self-comparison refusal |
| `node tools/core-purity-lint.mjs` | 0 | Core purity |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money boundary |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial adapter boundary |
| `pnpm turbo run lint` | 0 | All seven package checks; mandatory official lane result remains pending |
| Inline working-tree inspection using `selectLane`/`matches`, original lane JSON and original OpenAPI paths | 0 | Every changed/untracked task path declared; previous lanes and previous OpenAPI path definitions unchanged; not presented as official lane-check success |
| `node --test tools/*.test.mjs` | 0 | 39 tests |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web test` | 0 | 514 tests: core 380, config 2, AI fixtures 72, storage 4, web 56 |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | 3 pure unit tests; not PostgreSQL coverage |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 79 unit/service/boundary tests; excludes the existing listener-dependent HTTP test |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/identity.integration.test.ts` | 0 | Integration-test source typechecks; not executed DB assertions |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI IPC listen denied by sandbox |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 | Repository generator regenerated the document; an initial missing dependency-build error (exit 1) was resolved by building dependencies |
| `pnpm openapi:check` | 1 | Same tsx IPC denial |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same repository source generator/checker, with its IPC CLI wrapper bypassed |
| `pnpm turbo run build --filter=@jobguard/db... --filter=@jobguard/config` and `pnpm turbo run build --filter=@jobguard/api...` | 0 | Dependency/API preparation builds |
| `pnpm --filter @jobguard/api build` | 0 | Rebuilt after explicit DecisionsController injection registration |
| Compiled Nest initialization and registered-guard smoke via `pnpm --filter @jobguard/api exec node --input-type=module` | 0 | `NestFactory.create`, `app.init`, actual installed guard rejects unauthenticated dispatch with 401, `app.close`; no listener/DB connection opened |
| `pnpm --filter @jobguard/api exec node dist/generate-openapi.js --check` | 1 | Bonus compiled comparison found pre-existing emitted-metadata differences; source generator is the repository's authoritative check |
| Compiled/source Swagger path comparison via `pnpm --filter @jobguard/api exec node --input-type=module` | 0 | All four new `/auth/...` path schemas identical; 48 older business paths differ, recorded in BUILD_PLAN §14.3 |
| `git diff --check` | 0 | No whitespace errors |

Total executed unit/tool tests: **635**. Turbo used existing caches for unchanged packages
and reported sandbox cache-write warnings. Next reported the existing multiple-lockfile
workspace-root warning; earlier build output also contained the existing CSS warning.
These commands do not constitute a clean install or full CI pass.

## Not run and why

- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, existing HTTP health test and
  PostgreSQL regression suites: this sandbox cannot start PostgreSQL or bind localhost.
  The seven new real-PG cases in `packages/db/test/identity.integration.test.ts` are enabled
  in the existing DB suite, without skips or mocks replacing database guarantees.
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M0-6L.spec.ts`
  and earlier browser regressions: same PostgreSQL/listener restriction. Both existing
  projects select the new two-test spec; no success APIs are intercepted. No browser
  screenshots or traces were produced locally.
- Clean pinned install: dependencies were supplied and the dispatcher prohibited downloads.
- Real dependency audit/secrets scan: existing mandatory CI checks remain required; no
  scanner bypass or CI optionalization was added.
- Live email/provider tests, deployment, real-data/model evaluation: prohibited/unapproved.
  No AI prompt/model/parser changed; the existing 72 fixture AI tests still ran. Native
  suites are inapplicable to this auth leaf.
- Independent Claude verdict and separate technical acceptance: require the dispatcher
  commit and separate actors; neither is claimed here.

## Migration, invariants and compatibility

Only new migration: **0052_persisted_identity.sql**, appended after existing 0041; no other
migration number used. Existing synthetic identities need no backfill and are never
silently linked to email. The predecessor application can ignore the expansion. Forward
fix is to disable the identity credential/endpoints and apply a reviewed additive repair;
do not delete enrolled identities/tenants to roll back. `packages/db/MIGRATIONS.md` records
role grants, FORCE RLS policies, the tenant/membership/user-qualified discovery FK and
operator/Neon compatibility. The existing fresh/Neon suites expect 43 migrations now;
upgrade from 0041 and repeat migration are explicitly authored in the new PG suite.

Affected guarantees: identity trust boundary and tenant selection (AGENTS 5.1); exact
bootstrap authorization and synthetic-only operation (5.3, 5.10, 5.11); durable single-use
and failure counters/delivery state (5.4); append-only identity security events (5.7);
independent acceptance (5.13). No money, tax, fee entitlement, job spine, evidence or
commercial approval behavior changed. Security events contain classifications/UUID
references, never raw email, IP, codes or bearer tokens. Identity credentials remain a
trusted control-plane exception; business RLS does not defend their compromise.

C1–C8 evidence: persistent service/UI/source schemas and compiled composition built;
fixture-route/mode, role-injection, principal/CSRF/origin and import boundaries unit-tested;
PostgreSQL catalogs/races/replay/rollback/revocation/expiry and browser refresh/second-context,
source identities, banner, focus, labels, touch size and overflow have authored executable
coverage awaiting CI. Existing fixed demo context helpers remain in their synthetic-only
composition; real identity context construction stays in the principal bridge. Worker
execution and existing business decision/audit paths were reused and not reimplemented.

Before real-user release: D04 route approval and an implemented approved live transport,
D12 retention/deletion, all pilot operational gates, verified deployment/proxy source for
per-IP throttling and secret management. Web identity requests currently use a conservative
shared bucket instead of trusting forwarded IP headers. Pending/unknown delivery is never
shown as delivered and has no blind network retry. The runbook specifies alerts for
identity/storage failures, blocked routes and pending/unknown backlog; no deployed alert
service is claimed. No production capabilities or decisions were approved.

## Remaining gates and overlap

Technical acceptance is **pending** actual clean CI, PostgreSQL fresh/upgrade/catalog and
adversarial results, both browser projects plus earlier regressions, the official lane
check on a non-empty dispatcher commit range, a Claude verdict bound to that exact commit,
and separate acceptance. Founder owns push/merge/release. The older compiled/source
Swagger discrepancy is a separately recorded discovery, not repaired inline; new identity
path definitions agree in both generators.

Undeclared overlap: **none**. Declared shared serialization points: lane registry, AppModule
(controller/guard and explicit erased Pool token), generated OpenAPI, package exports,
web navigation, migration runner/sequence, Neon role bootstrap and Playwright fixture
configuration/drain. BUILD_PLAN changed only by the required append to §14.3 Discovered later;
no task contract, dependency, invariant or decision approval changed.
