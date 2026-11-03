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

The gateway requires a server-owned session resolver on every call. It fails
closed when the resolver is missing, returns no tenant or fails. Provider requests
use that session tenant; a conflicting request tenant is refused. Every source
must explicitly have the same tenant and `visibility: public`, otherwise neither
the provider nor output repair runs. The API's
`createAiSessionResolver` uses the existing verified principal bridge and server
identity credentials, independently of the AI payload. It checks session
expiry/revocation and current membership again for each call.

`AiCaptureAuthority` is a dark composition with no HTTP route. Its source loader
uses the verified tenant context and RLS to read `app.capture_source`, replacing
caller bytes, hash, tenant and visibility with stored values. Capture sources do
not have a visibility column: only immutable stored `text` and
`browser_local_transcript` kinds are classified public here. Audio and unknown kinds
are refused. No shadow/evidence table is queried. Missing records, other tenants,
and hash mismatches fail closed before provider execution. Membership is checked
again after the storage read, with no database transaction held over the provider
call. This is a current authorization check, not a lock over future revocation.

`fixtureAiSession` is exported only from `@jobguard/ai/testing`; an architecture
check prohibits its import from non-test code. The recorded capture fixture
builder retains its private synthetic tenant closure; fixture results are unchanged.
Other recorded fixture builders supply synthetic authority and public labels for
fictional snapshots, including shadow-proposal evaluation inputs. Those labels are
not production classification or access-control adapters.

This RED piece leaves D04 route approval open for people. Any live route or live
evaluation remains founder-reserved spending and requires separate authorization.
Shadow text must never enter a live path until a person approves that data flow.
`createLiveAiProvider` still refuses; gates G0–G5 are not opened. The local API
regressions use the existing in-memory identity provider, a fake database client
and the recorded fixture provider. They do not prove PostgreSQL RLS; database and
browser suites cannot run in this sandbox and remain CI checks. The golden record
is regenerated with `createGoldenRunRecord(await runCaptureEvaluation())` after
building the AI package, binding the changed fixture implementation bytes; this
remains a deterministic, zero-spend run with `NOT_AUTHORIZED` release status.

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
