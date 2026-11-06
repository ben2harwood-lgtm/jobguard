# LATER-SAFETY-133 — READY: PROPOSAL, NEEDS BEN

RED (sign-in). Prepared proposal only; NOPR. Ben's typed approval is required
before landing, followed by the existing independent RED review and green CI.
No approval, independent verification, commit, push, PR, merge or deployment is claimed.

Baseline inspected: HEAD and origin/main were both
`cc7e1cc891edf80d8dbfce8d7560607c497f00d4`; branch
`codex/sandbox/later-safety-133`, initially clean. The Next request route still
passed `web-bootstrap` for every sign-in/sign-up/invitation code request. This
confirms audit S01 / j02 B1 remains present. Relevant authority: M0-6L and
`docs/contracts/authentication-v1.md`.

## Prepared change

Use validated CF-Connecting-IP only for the operator-selected Workers deployment;
canonicalize IPv6 and keep the shared fail-closed fallback for other deployments,
missing/invalid addresses and spoofed forwarded headers. Never use X-Forwarded-For.
Keep ten requests per client per ten minutes and the existing resend cooldown;
add ten requests per normalized email across purposes and a 100-request global
ceiling per ten minutes. The 100 ceiling is a proposed tenfold backstop, subject
to the same typed approval. All persisted-provider callers share these controls.

Reuse existing challenge/window records and grants. Acquire one global advisory
transaction lock before IP/email locks and evaluate time after acquiring locks.
Counts and inserts remain in the same transaction; no migration, stored-format
change, extra credential, provider send or new public input. Existing real-recipient
and environment restrictions remain. Approval/session/tenant authority is unchanged
apart from the proposed client identity used for throttling.

Cloudflare's documented Worker-subrequest caveats are recorded in the contract:
this trusts the configured Workers ingress and same-zone deployment code, not
an arbitrary header at a directly reachable Node origin. No live ingress test.

## Checks actually run

Node v24.17.0, installed Vitest v4.1.12 and TypeScript v5.8.3; no package install.
The pnpm version shim failed its registry/signature lookup, so checks used the
already installed package binaries. No override or download was used.

- `apps/web`: `node_modules/.bin/vitest run --maxWorkers=2 app/api/auth/request/route.test.ts app/lib/cloudflare-pools.test.ts` — 16 passed.
- `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/identity-rate-limit.test.ts src/auth/identity.test.ts` — 11 passed.
- Repository root: `node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — PASS.
- Repository root: `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- Local prerequisite builds via `node_modules/.bin/tsc -p packages/<package>/tsconfig.json` for config, core, storage and db — PASS. These generated ignored dist files only.
- `git diff --check` — PASS.

First focused runs could not resolve unbuilt workspace package exports; after the
prerequisite builds the same named test runs passed. Local provider tests control
query responses: they establish decision/error/lock-order behavior, not PostgreSQL
isolation. Route tests establish deployment/header selection and response handling.

Added real-PostgreSQL regression in `packages/db/test/identity.integration.test.ts`:
concurrent ten-request client flood, unaffected second client, shared fallback,
normalized email across clients and purposes, 105 concurrent distinct clients
with exactly 100 successes, refusal above ceiling, and window expiry. NOT RUN here:
this sandbox cannot start PostgreSQL or bind localhost. Router/CI must run it.
Full CI, database suites, browser journeys and independent exact-head RED review
remain pending. No AI/model changes; no live evaluation is applicable.

Initial self-check LATER / SIMPLICITY:
`apps/api/src/auth/persisted-auth-provider.ts`, requestCode count queries — a later
measured optimization could combine the IP/global window counts into one aggregate
query, keeping their time predicate in one place and reducing query maintenance.
Non-blocking; no unrelated refactor included.
