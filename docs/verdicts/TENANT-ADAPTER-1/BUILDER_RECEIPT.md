# TENANT-ADAPTER-1 builder receipt

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/tenant-adapter-1`, cut from `origin/main` a7d5917. Routine work under BUILD_PLAN section 2.1
delegation (coordinator ruling 9 Oct 2026, "Option A, change the adapter"); to be recorded in the receipt as section 14.3 "Discovered later".
No migration. Builder receipt only — not independently verified, not accepted.

## Why

M0-6L (#104, not yet merged; local head 2994f60) adds a whole-repository tenant-context boundary scanner. After merging main it flags three sites
in M4-5-S's merged code: `packages/db/src/recovery-message-adapter.ts:33` stores the `VerifiedTenantContext` in a class field, and
`packages/db/src/recovery-message-repository.ts:262` and `:280` pass `ctx` into `new FakeRecoveryMessageAdapter(this.pool, ctx, ...)`. The current
code is safe in practice (synthetic-only paths, stamped context, TENANT-STAMP-1's runtime check in `withTenant`), but it should conform rather than
the scanner gain an exception. The scanner is untouched.

## Before and after

Adapter, before:

    export class FakeRecoveryMessageAdapter implements OutboundAdapter {
      constructor(private readonly pool: Pool, private readonly context: VerifiedTenantContext, private readonly mode: RecoveryMessageDeliveryMode) {}
      async deliver(action: Readonly<OutboundAction>): Promise<FakeDeliveryResult> { ... withTenant(this.pool, this.context, ...) ... this.context.tenantId ... }
      async reconcile(providerEffectKey: string): Promise<...> { ... withTenant(this.pool, this.context, ...) ... this.context.tenantId ... }
    }

Adapter, after (no field, cache or closure holds a context; the body is otherwise unchanged, the same `withTenant` calls and `.tenantId` reads
now use the argument):

    export class FakeRecoveryMessageAdapter {
      constructor(private readonly pool: Pool, private readonly mode: RecoveryMessageDeliveryMode) {}
      async deliver(context: VerifiedTenantContext, action: Readonly<OutboundAction>): Promise<FakeDeliveryResult> { ... withTenant(this.pool, context, ...) ... context.tenantId ... }
      async reconcile(context: VerifiedTenantContext, providerEffectKey: string): Promise<...> { ... withTenant(this.pool, context, ...) ... context.tenantId ... }
    }

Judgement call to review: the class no longer says `implements OutboundAdapter`. That interface (`packages/db/src/outbox.ts`) is
`deliver(action)` / `reconcile(providerEffectKey)` with no tenant, and `ActionExecutor` and `reconcileOutbox` call it that way. Changing it would
touch `outbox.ts`, every other adapter and their tests, all outside this lane, so I did not. Instead the repository hands the context to the adapter
through a small wrapper (below). If the integrator would rather change the shared interface, that is a separate leaf.

Repository, before (both call sites, `advance` at :262 and `reconcile` at :280):

    const adapter = new FakeRecoveryMessageAdapter(this.pool, ctx, input.outcome satisfies RecoveryMessageDeliveryMode);
    ... new ActionExecutor(this.pool, new Map([[adapter.name, adapter]]), noTelemetry).execute(ctx, claimed.outboxId) ...
    const adapter = new FakeRecoveryMessageAdapter(this.pool, ctx, "success");
    ... reconcileOutbox(this.pool, ctx, claimed.outboxId, adapter) ...

Repository, after (one module-level helper, two call sites; `ctx` is passed whole at each adapter call, never to a constructor):

    const executorAdapter = (adapter: FakeRecoveryMessageAdapter, ctx: VerifiedTenantContext): OutboundAdapter => ({
      name: adapter.name, supportsProviderDeduplication: adapter.supportsProviderDeduplication,
      deliver: action => adapter.deliver(ctx, action), reconcile: providerEffectKey => adapter.reconcile(ctx, providerEffectKey),
    });
    const adapter = executorAdapter(new FakeRecoveryMessageAdapter(this.pool, input.outcome satisfies RecoveryMessageDeliveryMode), ctx);
    const adapter = executorAdapter(new FakeRecoveryMessageAdapter(this.pool, "success"), ctx);

The wrapper lives for one executor or reconcile call inside a repository method that already holds `ctx`, exactly as the repository's many `withTenant(...,
ctx, async db => ...)` closures do. The one new import is the `OutboundAdapter` type. The scanner accepts it with no exception (proof below).

## Changed test lines (signature only, no assertion touched)

One test file constructs the adapter: `packages/db/test/recovery-messages.integration.test.ts`, the helper `practiceAdapter` (line 107). It fed the
adapter straight to `new ActionExecutor(...)`, so it now builds the adapter without the context and returns the same `OutboundAdapter` shape,
supplying the context the helper used to capture at construction (`stamped = context`, read at the same moment as before):

    - const practiceAdapter = (mode: ... = 'success') => new FakeRecoveryMessageAdapter(runtime, context, mode);
    + const practiceAdapter = (mode: ... = 'success'): OutboundAdapter => {
    +   const fake = new FakeRecoveryMessageAdapter(runtime, mode), stamped = context;
    +   return { name: fake.name, supportsProviderDeduplication: fake.supportsProviderDeduplication, deliver: action => fake.deliver(stamped, action), reconcile: key => fake.reconcile(stamped, key) };
    + };

Every use of `practiceAdapter(...)` (executor runs, and `practiceAdapter().deliver(action)` at the crashing-adapter helper) is unchanged.
`vi.spyOn(FakeRecoveryMessageAdapter.prototype, 'reconcile')` is unchanged and still observes the real prototype method (call counts only).
No assertion, timeout or test name changed. The other db test files do not reference the adapter. `recovery-message-repository.test.ts` and
`recovery-message-upgrade.integration.test.ts` are unchanged.

## Scanner proof (M0-6L, no exception)

Temporary detached worktree, left in place under the never-delete rule: `/private/tmp/jg-tenant-adapter-1-scanner-proof` at 2994f60
(`git worktree add --detach`). Offline install: `pnpm install --frozen-lockfile --offline`, exit 0. The scanner file
`apps/api/src/auth/context-boundary.test.ts` is byte-identical to 2994f60's (sha256 49086b7957942cd23531b48e08ce9a6ac93c8fea654ac9873231ee13bc4ac0c3
for both). `codex/sandbox/m0-6l` and `.worktrees/m0-6l` were not touched.

Command (from the temp worktree, inside `heavy-slot`): `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts`

- Before my diff: exit 1, 1 failed | 144 passed (145). It names exactly the three sites: `recovery-message-adapter.ts:33`,
  `recovery-message-repository.ts:262`, `recovery-message-repository.ts:280`.
- After my `packages/db/src` diff applied UNCOMMITTED (`git diff origin/main..HEAD -- packages/db/src | git -C <tmp> apply`; byte-identical to the
  patch applied): exit 0, Test Files 1 passed (1), Tests 145 passed (145).

## Commands, exits, counts

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | done |
| `pnpm turbo run build --filter='./packages/*'` (in heavy-slot) | 0 | 5 of 5 tasks |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `tenant-adapter-1` passed (also re-run after this receipt, see final line below) |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | 0 | 3 files, 29 tests passed |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 | 31 files, 729 tests passed |
| db `test/recovery-message-repository.test.ts` | 0 | 9 passed |
| db `test/recovery-messages.integration.test.ts` | 0 | 98 passed |
| db `test/recovery-message-upgrade.integration.test.ts` | 0 | 3 passed |
| `M4-5-S.spec.ts` mobile-360 + desktop, production mode (`CI=1`, `next start`, as the repo's own CI config) | 0 | 14 passed |
| scanner at 2994f60 before and after | see above | 144 of 145 (red) then 145 of 145 |

Environment fixes (nothing in the tests or committed config changed):

- First `recovery-messages.integration` run failed at database start ("Postgres init script exited with code null") because pnpm skipped the
  `@embedded-postgres/darwin-arm64` postinstall; I ran that package's own `node scripts/hydrate-symlinks.js` (the postinstall) by hand, then it passed.
- `@jobguard/api` and `@jobguard/web` had to be built (`pnpm turbo run build --filter=@jobguard/api`, `pnpm --filter @jobguard/web build`) for the browser spec.
- The pinned `chromium_headless_shell-1193` is not installed and the pinned full `chromium-1193` install is incomplete (its framework is missing).
  I used an UNCOMMITTED Playwright config kept outside the repository (scratchpad `playwright.local.config.ts`) that wraps `apps/web/playwright.config.ts`
  and only adds `launchOptions.executablePath` pointing at the installed `chromium_headless_shell-1234`. Nothing under the repository changed for this.
- A first browser run without `CI=1` used `pnpm dev` and went 2 passed / 12 failed (page waits and a double register read that only a development
  server's React strict mode produces). That is the wrong mode for this spec; the repo's CI config runs the production build, where it is 14 of 14.
  I did not run a development-mode baseline on `origin/main`, so I cannot say those twelve are pre-existing; I can only say production mode passes.
- The changed test file is not covered by `tsc` in `pnpm typecheck` (`packages/db` includes `src` only), so I type-checked it once with a temporary
  tsconfig in the git-ignored `packages/db/dist` folder: exit 0, no errors.

Builder receipt only — not independently verified, not accepted.
