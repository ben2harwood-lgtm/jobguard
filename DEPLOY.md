# Deploy the synthetic no-charge demo (Cloudflare Workers + Neon)

JobGuard no longer deploys to Vercel. The web app runs as the Cloudflare Worker `jobguard-demo`; follow [Cloudflare hosting](docs/operations/cloudflare-hosting.md) for the account, build, secrets, deploy and domain steps. This page keeps the database recipe and the operator commands.

This recipe creates **synthetic demonstration infrastructure only**. It does not enable G1 or M0-13, approve D01–D12, accept real customer data, contact live providers, send messages, call AI/transcription, or create/collect a JobGuard charge. Do not reuse this project, database, or credentials for a pilot or production workload.

## Values you need (never commit them)

| Variable | Exact value contract |
|---|---|
| `JOBGUARD_ENV` | Literal `synthetic_demo`. Any other value makes bootstrap and deployed DB reads fail closed. The Worker gets it from `apps/web/wrangler.jsonc`. |
| `DATABASE_URL` | Neon URL with username `jobguard_runtime`, its generated strong password, and database `jobguard_synthetic_demo`, for example `postgresql://jobguard_runtime:<runtime-password>@<neon-host>/jobguard_synthetic_demo?sslmode=require`. A Worker secret. |
| `MIGRATION_DATABASE_URL` | Neon project-owner **direct (unpooled)** URL to the same database, for example `postgresql://<neon-owner>:<owner-password>@<neon-direct-host>/jobguard_synthetic_demo?sslmode=require`. Used only by `pnpm bootstrap:demo` in a trusted shell. Never a Worker secret or build variable. |

There are no public (`NEXT_PUBLIC_…`) secrets. Do not add provider keys, SMTP credentials, payment credentials, real S3 credentials, live AI keys, or customer data. Application requests use only `DATABASE_URL`.

## Neon database

1. Sign in to Neon directly (not through another platform's integration) and click **New project**. Choose an EU/UK region suitable for this disposable synthetic demo.
2. Open **Databases** and create a database named exactly **`jobguard_synthetic_demo`**. Do not point this recipe at `neondb`, a pilot database, or production.
3. On the **Connection details** panel select `jobguard_synthetic_demo`, turn **Connection pooling off**, and copy the owner connection string. This is the value for `MIGRATION_DATABASE_URL`.
4. Choose a new strong password for the runtime role and substitute it into the `DATABASE_URL` placeholder above, keeping username `jobguard_runtime` and database `jobguard_synthetic_demo`. This login starts working only after the first bootstrap creates the role.
5. Run the manual bootstrap below once, then deploy the Worker.

## Manual bootstrap and verification

Bootstrap never runs inside the Worker or its build. Before the first deploy, after each new migration, and after rotating the runtime password, open a trusted shell with the three variables set and run:

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
- Delete the Worker and Neon database when testing ends. Do not migrate its records into a real environment.

## Audit checkpoint hand-off (operator)

Practice sandbox only. From a trusted shell with `JOBGUARD_ENV=synthetic_demo` and `MIGRATION_DATABASE_URL=<owner-login-url>` already set, run:

```sh
pnpm handoff:audit-checkpoint --operator <name>
pnpm handoff:audit-checkpoint --operator <name> --tenant <id>
```

`--operator` is required: 1–64 letters, digits, dots, underscores or hyphens. Use a plain operator name, never a credential. The connected login must own `jobguard_synthetic_demo` and be able to act as the existing `jobguard_migration` and `jobguard_runtime` roles. A refused login receives a message naming the found role and required owner/migration role, with exit 1. Application requests continue to use their existing login.

The command emits one JSON line with `ok`, `environment`, `database` and per-company `outcomes`. An effective outcome is `handed_off` with the new sequence; an idle outcome is `unchanged` with `message: "nothing to do"`; a failure is `failed` with a typed code and exit 1. Successful runs exit 0. Each effective run records the operator label, database session user and event server time in that company's audit trail, with the checkpoint taken at that event. Driver details and connection URLs are omitted.

It is safe to run again: without new events it writes nothing. A company created after the last run needs another run before its first signed audit export. Creating an export itself adds an event, so a subsequent hand-off may take another checkpoint. The command closes its dedicated connection on success and failure; company settings exist only within its own transactions. It adds no database rights and is never run from a request, worker, deployment hook or timer.

## G1 pilot infrastructure fixture

The pilot topology and worker supervisor are in `infra/pilot/`. Run
`bash tools/pilot-fixture.sh` on an isolated Linux Docker host with Compose v2,
OpenSSL and ripgrep. The command generates disposable fixture credentials,
builds the application image, brings up web, API, worker and an independent
monitor, exercises the alert and recovery paths, and removes its containers
and volumes on exit. An existing image built from the same candidate can be
used with `PILOT_FIXTURE_SKIP_BUILD=1`. The containers publish no host ports.

The fixture uses fictional content, private internal networks, a PostgreSQL
sentinel backup and restore, and a private versioned object bucket. The worker
runs the existing pilot entry point with outbound paused. Its approval receipt
is generated by the test fixture inside the disposable network. Fixture
transport and volumes are local. Production TLS, encryption, host and account
bindings, and delivery destinations remain D04/PILOT-12 work. See
[Pilot infrastructure and recovery](docs/operations/pilot-infrastructure.md).
