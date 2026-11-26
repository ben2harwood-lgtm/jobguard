# JobGuard fictional demo on Cloudflare Free

Ben performs the account, credentials, deployment and DNS steps below. Use fictional
jobs only. This host change does not approve real customers, live providers or money.

1. Create or sign into a Cloudflare account. Select Workers Free under Workers &
   Pages; do not enable paid Workers, Images, R2 or other paid services. This is a
   **Worker**, not a Pages static export. JobGuard no longer deploys to Vercel.

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
   transactions as they are. Worker pools are fresh and close connections on release.
   No Hyperdrive or database replacement is needed.

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

9. The web Worker does not run the Graphile worker. Without it, the practice final
   check, evidence packs and source holds stay queued and DEMO-S cannot finish. The
   repository includes `.github/workflows/demo-worker-tick.yml`, a free scheduled
   GitHub Action that runs the existing worker (`apps/api/src/worker.ts`) in practice
   mode for one 240-second window every 10 minutes. It is off until you turn it on,
   and it never deploys. A demo user may wait up to about 15 minutes for a result.
   GitHub can delay scheduled runs. A Cloudflare Cron Trigger is not used: this
   worker reads fixture files from disk and uses Graphile's own cron schedule. It also
   needs the shadow and queue logins, which stay out of the public web Worker.
   To turn it on:
   1. Connect as the administrative database user and create three worker logins.
      Use new random passwords and keep them outside the repository:
      ```sql
      CREATE ROLE jobguard_demo_worker_queue LOGIN PASSWORD '<new>' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
      GRANT jobguard_infrastructure TO jobguard_demo_worker_queue;
      CREATE ROLE jobguard_demo_worker_actions LOGIN PASSWORD '<new>' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
      GRANT jobguard_worker TO jobguard_demo_worker_actions;
      CREATE ROLE jobguard_demo_worker_shadow LOGIN PASSWORD '<new>' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
      GRANT jobguard_shadow TO jobguard_demo_worker_shadow;
      GRANT CREATE ON DATABASE jobguard_synthetic_demo TO jobguard_demo_worker_queue;
      ```
   2. In the GitHub repository, open Settings → Secrets and variables → Actions. Add four
      repository secrets, each ending `/jobguard_synthetic_demo?sslmode=require`:
      `DEMO_GRAPHILE_DATABASE_URL` uses the queue login, `DEMO_WORKER_DATABASE_URL` the
      actions login and `DEMO_SHADOW_DATABASE_URL` the shadow login.
      `DEMO_RUNTIME_DATABASE_URL` uses the same `jobguard_runtime` login as the
      Worker's `DATABASE_URL`. Never add `MIGRATION_DATABASE_URL` or an administrative
      login. The workflow refuses any other database name or `JOBGUARD_ENV`.
   3. Add the repository variable `JOBGUARD_CRON_ENABLED` with value `true`. Under
      Actions, run **Demo worker tick** once with **Run workflow**. A green run ends
      with `Worker stopped at the 240s cap.` After this first run creates the
      `graphile_worker` schema, run
      `REVOKE CREATE ON DATABASE jobguard_synthetic_demo FROM jobguard_demo_worker_queue;`.
   4. Run DEMO-S to the final check and confirm it completes within one tick.
   To pause the worker, set `JOBGUARD_CRON_ENABLED` to `false`. While the shadow login exists,
   `pnpm bootstrap:demo` refuses because `jobguard_shadow` has a holder. Before
   re-running bootstrap, run `REVOKE jobguard_shadow FROM jobguard_demo_worker_shadow;`.
   After bootstrap finishes, grant it again. GitHub's Actions terms ask for low-burden use. This is
   one short run every 10 minutes for a fictional demo, but read those terms before
   enabling it. Do not add a live provider or an administrative database credential
   to make a missing step pass.

10. Initially test on workers.dev. Only after the journeys pass, save the existing DNS
    records and TTL, add the intended custom domain under the Worker's Settings →
    Domains & Routes, and follow Cloudflare's DNS instructions. Add that HTTPS origin
    to `JOBGUARD_ALLOWED_ORIGINS` and update `AUTH_ALLOWED_ORIGIN` before testing sign-in
    there. A single identity origin is supported. Keep the old deployment available.

11. To roll back, open the Worker's **Deployments** tab and roll back to the last working
    version (or run `wrangler rollback` from a trusted checkout). Worker settings and secrets
    stay as they are. If DNS was changed, restore the saved records. There is no Vercel
    fallback: that account is blocked and JobGuard no longer deploys there. Keep an old
    Worker archived/disabled rather than deleting it. This piece introduces no database
    migration to reverse.

Sources checked 31 October 2026: [OpenNext setup](https://opennext.js.org/cloudflare/get-started),
[database connections](https://opennext.js.org/cloudflare/howtos/db),
[Worker environment](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/),
[PostgreSQL support](https://developers.cloudflare.com/workers/tutorials/postgres/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
