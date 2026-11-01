# JobGuard fictional demo on Cloudflare Free

Ben performs the account, credentials, deployment and DNS steps below. Use fictional
jobs only. This host change does not approve real customers, live providers or money.

1. Create or sign into a Cloudflare account. Select Workers Free under Workers &
   Pages; do not enable paid Workers, Images, R2 or other paid services. This is a
   **Worker**, not a Pages static export. Keep the Vercel project and `vercel.json`.

2. Keep the exact dependency pins (`@opennextjs/cloudflare` 1.20.12 and Wrangler
   4.151.1) and the committed lockfile. Before connecting automatic deployment,
   obtain green CI plus independent RED review. Require
   `pnpm install --frozen-lockfile`, the Cloudflare bundle workflow and both
   demo journeys to pass. A PR bundle build uses no secrets and does not deploy.

3. Keep PostgreSQL with the existing approved UK/EU demo database provider. Cloudflare
   Workers Free does not provide PostgreSQL. The current bootstrap requires the
   database named `jobguard_synthetic_demo`, an administrative connection and a
   separate `jobguard_runtime` login. In a trusted Node 24 environment, supply
   `JOBGUARD_ENV`, `DATABASE_URL` and `MIGRATION_DATABASE_URL` privately, then run
   `pnpm bootstrap:demo` once before deploying a compatible build. This command
   applies repository migrations and seeds fictional fixtures; review its target
   first. Never run bootstrap in the Worker or on each request. Provision the
   separate identity login following [the identity runbook](m0-6l-identity.md).

4. The Worker uses the existing `pg` 8.16.3 driver through `nodejs_compat` TCP sockets.
   Use the provider's public TLS PostgreSQL endpoint and certificate validation.
   Do not use localhost or a private network endpoint. Keep database roles, RLS and
   transactions as they are. Worker pools are fresh and close connections on release;
   Vercel keeps its existing pooling. No Hyperdrive or database replacement is needed.

5. In Workers & Pages, connect this GitHub repository with repository root as the
   build root. Select Node 24 and pnpm 10.28.1. Install with
   `corepack enable && pnpm install --frozen-lockfile`. Set the build command to
   `pnpm --filter @jobguard/web build:cloudflare`. Set the deploy command to
   `pnpm --filter @jobguard/web exec opennextjs-cloudflare deploy`.
   Review when this connection will first deploy before saving it. Alternatively,
   deploy from a trusted local checkout with that same command after building; use
   Wrangler login or a narrowly scoped Workers API token. For a future GitHub deploy
   Action, store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub secrets.
   The included PR Action only builds; it has no deployment token.

6. Name the Worker `jobguard-demo`, matching `apps/web/wrangler.jsonc` and its
   `WORKER_SELF_REFERENCE` service. If you choose another name, change both together.
   Set Worker secrets `DATABASE_URL`, `IDENTITY_DATABASE_URL` and `AUTH_CODE_SECRET`.
   Do not put `MIGRATION_DATABASE_URL` in the Worker or its build settings.
   Set `AUTH_ALLOWED_ORIGIN` to the exact HTTPS demo origin. Set
   `JOBGUARD_ALLOWED_ORIGINS` to the exact allowed HTTPS origins, comma separated.
   `JOBGUARD_ENV` and `JOBGUARD_HOSTING` are already supplied by Wrangler. The
   compatibility date populates `process.env` from Worker variables and secrets.
   Workers do not automatically set `CF_PAGES_URL`; either explicitly set it to the
   exact workers.dev URL or list that URL in `JOBGUARD_ALLOWED_ORIGINS`. Custom routes
   also belong in that allowlist. Never use wildcard origins or request Host headers.

7. For a local-only preview, build first and run
   `pnpm --filter @jobguard/web preview:cloudflare`. Put fictional local credentials
   in ignored `apps/web/.dev.vars`, with explicit localhost allowed origins and
   `AUTH_ALLOWED_ORIGIN` matching the preview port. This script uses `wrangler dev
   --local`; it does not deploy. Local code can still reach the database you configure,
   so only use a disposable fictional database.

8. Check the Workers Free limits before switching: the current documentation lists
   100,000 requests/day, 10 ms CPU per invocation, 128 MB memory, six simultaneous
   outgoing connections and 50 subrequests per request. For this Free-plan switch,
   require a Worker bundle within 3 MiB compressed. `wrangler deploy --dry-run`
   reports total upload and gzip size without deploying; compare gzip to that budget.
   Limits can change: confirm them in the linked documentation and account dashboard.
   Network waiting differs from CPU time. Next.js rendering and cryptography may
   exceed 10 ms; a successful build does not prove Free runtime suitability. Run both
   DEMO-S and ENT-11b on phone and laptop, inspect Worker CPU/errors and database
   connection counts, and keep the switch pending if Free limits are exceeded.

9. A web Worker does not run the existing Graphile worker service. Keep any required
   background demo tasks on their existing approved host; verify final-check processing
   in DEMO-S before claiming the complete journey works. Do not add a live provider
   or an administrative database credential to make a missing step pass.

10. Initially test on workers.dev. Only after the journeys pass, save the existing DNS
    records and TTL, add the intended custom domain under the Worker's Settings →
    Domains & Routes, and follow Cloudflare's DNS instructions. Add that HTTPS origin
    to `JOBGUARD_ALLOWED_ORIGINS` and update `AUTH_ALLOWED_ORIGIN` before testing sign-in
    there. A single identity origin is supported. Keep the old deployment available.

11. To roll back, restore the saved DNS records to the last working Vercel deployment
    and restore its matching identity/allowed-origin settings. The Vercel build still
    runs the original `bootstrap:demo` and web build. Confirm Vercel account access is
    restored first: an account still reporting “Account is blocked” cannot serve as a
    proven rollback. Keep the Cloudflare Worker archived/disabled rather than deleting
    it. This piece introduces no database migration to reverse.

Sources checked 31 October 2026: [OpenNext setup](https://opennext.js.org/cloudflare/get-started),
[database connections](https://opennext.js.org/cloudflare/howtos/db),
[Worker environment](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/),
[PostgreSQL support](https://developers.cloudflare.com/workers/tutorials/postgres/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
