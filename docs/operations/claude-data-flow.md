# M0-12a Claude route — dark contract only

Status: proposed, disabled. D04 has no approval evidence. This change does not
verify any real model, profile, provider capability or residency claim.

| Register field | Current value |
| --- | --- |
| Provider / feature | Proposed Claude structured proposals behind `packages/ai` |
| Accountable owner | Data/security owner; founder authorizes live evaluation spending |
| Environment | Deterministic synthetic contract tests only |
| Categories / subjects | Made-up source text, hashes, citation offsets and proposals; no real subjects |
| Purpose / lawful basis | Contract verification only; real processing basis unapproved |
| Controller / processor | Proposed JobGuard controller / provider processor; terms unverified |
| Origin | Local tests and CI |
| Processing / storage / logs / backups | Fake in-process transport only; real destinations unverified and blocked |
| Endpoint / deployment | `https://claude.invalid/messages`; synthetic model and deployment IDs |
| Proposed regions | Explicit `eu-west-2`, `eu-west-1` or `eu-central-1`; names alone confer no approval |
| Subprocessors | Unverified; blocks real processing |
| Retention / training / deletion | Unverified; blocks real processing |
| Encryption / credentials | No credentials, no network default; real transport/security unverified |
| Direction | Synthetic request and response through explicitly injected fake fetch |
| Fallback | Deny; redirect errors, no retry or alternate route |
| D04 / D12 evidence | None; D04 proposed, D12 applicability needs review before release |
| Review date / evidence | 2026-10-29 source and deterministic adapter tests; no provider verification |
| Gate / kill switch | Live factory always throws `live_route_disabled`; no enabling environment flag |

`createDarkClaudeProvider` requires explicit synthetic configuration and a fake
fetch transport. Its zero-pence budget is a refusal to support paid traffic,
not a model pricing estimate. Request bytes and output-token limits apply before
transport. Timeout and cancellation cover response parsing as well as transport.
No credentials, vendor SDKs, commercial tools or feature callers are introduced.
Sources are serialized as untrusted user data separately from the fixed system
instruction; the gateway validates the caller's schema and citation bounds,
permits one local repair, and creates provenance from server configuration.
This separation mitigates injection; it does not prove model accuracy.

CI builds the AI dependency closure and runs `eval:contract` on every candidate,
including model/prompt/parser/schema changes. It uses the existing fixture gateway,
separate corpus/labels, per-case failures and fixed proposed targets. It remains
zero-spend fixture evidence, never live release evidence.

After building, `pnpm --filter @jobguard/ai eval:live` is the scripted live release
preflight. It always exits 1 with a machine-readable BLOCKED report. It is not run
as a live evaluation by this piece. There is no release approval from fixture CI.
Before any live run or release, a separately authorized change must verify and
register the exact route/model/profile and all destinations, bind D04 approval,
implement real credentials and cost accounting, and replace the blocked preflight
with the founder-authorized golden runner. That runner must preserve the existing
thresholds, record deployment/prompt/schema/dataset versions, cost, per-case
failures and numerators/denominators, and verify persisted citation retrieval.
No migration, deployment or real provider call is part of this slice.
