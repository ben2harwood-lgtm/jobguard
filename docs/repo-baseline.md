# Repository baseline — M0-1

**Observed:** 13 September 2026. **Scope:** source inspection before the M0-1 scaffold.

## Before editing

- The repository contained the rev 2.2 planning/context documents and two UX-reference HTML files. It contained no application source, package manifest, lockfile, CI workflow, or container definition. Those documents and prototypes were preserved.
- Runtime inspection found Node `v24.15.0`, Corepack `0.34.6`, and pnpm `10.28.1`. Node 24 is the plan's recorded approved deviation from Node 22 for M0–M2; `.nvmrc`, package engines, and CI pin it. Revisit compatibility at M3 before Expo/EAS work.
- `docker` was not installed, so the authored Compose stack was not started or smoke-tested. This does not block the DB-independent M0-1 liveness gate; it blocks the applicable later container-backed tasks.

## Created and reused

- Created the pnpm/Turborepo workspace, strict TypeScript packages, NestJS API, Next.js web shell, deterministic OpenAPI artifact/check, tests, CI, environment template, and synthetic-only Compose stack.
- Adapted the lane-boundary control described in `docs/context/OWN_MIND_REUSE.md`; no implementation source was available to copy. Added a canary proving the core purity detector rejects a forbidden dependency.
- No customer data, secrets, payment integration, live provider call, migration, or production capability was introduced.

## Version and update policy

Every direct package and container dependency is exactly pinned. A pnpm lockfile could not be generated because all attempted registries returned HTTP 403; frozen-install verification is therefore held rather than claimed. Automated dependency review and secret scanning run in CI. Security updates should be applied in a dedicated, tested change; major upgrades require the decision/task process in `AGENTS.md`. Node support and stack compatibility must be revalidated before M3 and before the selected major reaches end of support.

## Not verified in M0-1

- Hosted CI execution is deferred until the founder creates/pushes a remote; local commands are the only execution evidence.
- Compose services and image availability were not checked because there is no container runtime.
- PostgreSQL, RLS, MinIO behavior, worker delivery, provider connectivity, and browser journeys belong to later tasks and were not run.
