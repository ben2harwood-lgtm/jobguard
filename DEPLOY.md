# Deploy the synthetic no-charge demo (Vercel + Neon)

This recipe creates **synthetic demonstration infrastructure only**. It does not enable G1 or M0-13, approve D01–D12, accept real customer data, contact live providers, send messages, call AI/transcription, or create/collect a JobGuard charge. Do not reuse this project, database, or credentials for a pilot or production workload.

## What the deploy does

Vercel installs the pinned workspace and runs:

```sh
pnpm bootstrap:demo && pnpm turbo run build --filter=@jobguard/web...
```

The first command refuses anything except `JOBGUARD_ENV=synthetic_demo` and a database named exactly `jobguard_synthetic_demo`. Under an advisory lock it creates/repairs the restricted `jobguard_migration` and `jobguard_runtime` roles, applies exactly migrations `0000` through `0020` in order through the direct owner connection (the migrations assign objects to `jobguard_migration`), and idempotently records the single fixed synthetic tenant through the existing demo-seed command envelopes. Re-running a Vercel build is safe. The second command builds only `@jobguard/web` and its declared workspace dependencies through Turbo; `apps/api` and a worker are not deployed.

## Values you need (never commit them)

Set these three Vercel variables for **Production, Preview, and Development** only if all three environments intentionally share this disposable synthetic database. Otherwise use a separate `jobguard_synthetic_demo` database per Vercel environment.

| Variable | Exact value contract |
|---|---|
| `JOBGUARD_ENV` | Literal `synthetic_demo`. Any other value makes bootstrap and deployed DB reads fail closed. |
| `DATABASE_URL` | Neon **pooled** URL, with username `jobguard_runtime`, its generated strong password, and database `jobguard_synthetic_demo`, for example `postgresql://jobguard_runtime:<runtime-password>@<neon-pooled-host>/jobguard_synthetic_demo?sslmode=require`. |
| `MIGRATION_DATABASE_URL` | Neon project-owner **direct (unpooled)** URL to the same database, for example `postgresql://<neon-owner>:<owner-password>@<neon-direct-host>/jobguard_synthetic_demo?sslmode=require`. |

There are no public (`NEXT_PUBLIC_…`) secrets. Do not add provider keys, SMTP credentials, payment credentials, real S3 credentials, live AI keys, or customer data. The migration URL is used by the build bootstrap; application requests use only `DATABASE_URL`.

## Click-by-click setup

### 1. Neon

1. Sign in to Neon and click **New project**. Choose an EU/UK region suitable for this disposable synthetic demo.
2. Open **Databases** and create a database named exactly **`jobguard_synthetic_demo`**. Do not point this recipe at `neondb`, a pilot database, or production.
3. On the **Connection details** panel select `jobguard_synthetic_demo`, turn **Connection pooling off**, and copy the owner connection string. This is the value for `MIGRATION_DATABASE_URL`.
4. Choose a new strong password for the runtime role. Substitute it into the `DATABASE_URL` placeholder above. Select/copy Neon's pooled hostname (it normally contains `-pooler`) while keeping username `jobguard_runtime` and database `jobguard_synthetic_demo`. It is expected that this login starts working only after the first bootstrap build creates the role.

### 2. Vercel

1. In Vercel click **Add New → Project**, select the JobGuard repository, and click **Import**.
2. Leave **Root Directory** at the repository root (`.` / blank). Do **not** select `apps/web`; root `vercel.json` owns the filtered monorepo build.
3. The repository supplies the install command `corepack enable && pnpm install --frozen-lockfile`, build command shown above, and output directory `apps/web/.next`. Do not replace them in Project Settings.
4. Optionally add the Neon integration to the project. Integration-generated URL names are not consumed automatically: in **Settings → Environment Variables**, create the exact three names in the table above and paste the corresponding direct/pooled values.
5. Click **Deploy**. The build log must contain one JSON line with `"ok":true`, `"database":"jobguard_synthetic_demo"`, and `"migrations":21`. No password is printed.
6. Open the Vercel deployment URL, click **Continue with demo code**, confirm the **Jobs** heading and seeded **Synthetic kitchen extension**, then click **Walk a new job**. The page must say **Synthetic fixture · zero spend**.

If bootstrap fails, fix the database name, endpoint kind, owner privileges, or environment values and click **Redeploy**. Never bypass its target checks or run migrations through the runtime URL.

## Manual bootstrap and verification

The normal Vercel build invokes bootstrap automatically. To run it immediately after rotating the runtime password, open a trusted shell with the three variables set and run:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm bootstrap:demo
```

Expected output is a single success JSON object. Run the same command again to verify idempotency. `pnpm test:deploy` is the CI smoke receipt: it starts fresh PostgreSQL, bootstraps roles/migrations/seed twice, verifies runtime RLS does not leak tenant state through a reused pooled connection, then exercises demo sign-in and the first “Walk it” journey step.

## Pooler-safe RLS guarantee

`withTenant` checks a verified membership-derived tenant context, starts a transaction on one checked-out connection, calls parameterized `set_config('app.tenant_id', tenantId, true)` (the PostgreSQL equivalent of `SET LOCAL`), performs the query on that same connection, and commits or rolls back before release. The `true` local flag prevents a tenant GUC surviving in Neon's transaction-pooled connection. No deployed web query sets `app.tenant_id` at session scope. RLS remains forced on tenant business tables; UUIDs and query parameters are not authorization.

## Operational boundary

- This is a disposable synthetic demo, not evidence of real-data readiness, residency approval, backup/restore readiness, external-provider approval, regulatory approval, or production acceptance.
- Demo UI actions remain fixture/local behavior: no live send, charge, spend, payment rail, AI, transcription, or provider fallback exists in this deployment.
- Delete the Vercel project and Neon database when testing ends. Do not migrate its records into a real environment.
