# Codex build sessions and receipts

**Owner:** build coordinator. **Adopted:** Ben, 21 October 2026, direct request to incorporate the supplied
cache addendum into the build process. **Status:** mandatory operating method for authorised work;
automatic enforcement and cache benefit require separate evidence.

This supplements `BUILD_SPEED_PLAN_V5_2026-10-20.md` and its cache addendum. Each repository's own
canon, issued orders, permissions, STOPs and acceptance rules still control its work. Apply this method
to build preparation, dispatch, interruptions, repairs, testing, integration and handover. It does not
issue a leaf, restart a stopped session, grant new directory access or change any release authority.

At dispatch the coordinator verifies that the actual builder checkout can read this policy and includes
its path/version in the bounded order. For a cloud or separate checkout, supply the policy as an explicit
task input when absent; do not assume a sibling repository or a newly edited instruction file is loaded
into an already open session. Existing sessions must read the current policy on their next authorised
turn. Propagation never expands the builder's file allowlist or restarts a stopped job.

## Session ownership

Use one saved Codex session per issued, bounded product leaf, including its interrupted turns, follow-up
tests and repairs. A new leaf or materially different authority/scope needs a new bounded session. Existing
multi-leaf histories are provenance, not a reusable builder session for unrelated work: establish a bounded
mapping before the next dispatch. Record a successor session and reason when the original cannot safely
be resumed; never manufacture continuity or assume its cache transfers.

Keep the coordinator's thread for the current repository/target or tightly bounded phase. Keep the CI
owner's thread for the same comparison experiment and the test owner's thread for the same investigation.
Separate genuinely diverging experiments or unrelated failures. Never run two writers in one session or
worktree. Changing attempt number alone does not require a new session for the same leaf.

The independent Claude checker gets the immutable candidate, policies and evidence independently through
the approved checker route. Do not fork or reuse builder context as the independent review. Existing extra
reviews and separate acceptance requirements continue. Standalone ChatGPT planning chats have their own
rules; this policy establishes no cache guarantee for them.

Keep JobGuard → AAC → Workings focus order and the current shared four-slot model (coordinator, CI, test,
product), subject to tighter capacity rules. This policy adds no workers. AAC remains Prepare and Workings
Maintain until focus moves under V5. Reading/installing this policy is not pipeline work on those projects.

## Before dispatch or resumption

1. Resolve the exact issued task and its saved session ID from its existing queue/receipt. Check project,
   role, host, authenticated route and worktree. Never use automatic `--last` selection for concurrent jobs.
   Do not select another account simply to recover a session; use the recorded authorised route. If the
   mapping or allowed-file scope is missing, hold the affected resume and reconstruct it from durable facts.
2. Read current project instructions and task contract. Re-resolve repository, integration target, base and
   source pin, worktree/branch HEAD, `git status`, staged/unstaged/untracked candidate changes, allowed paths,
   queue/dependency/STOP state, last accepted evidence and allowed test/runtime environment. Chat history
   and compaction summaries are working context, never current source or permission evidence.
3. Record that preflight in the task receipt. A changed target, source, scope, hold, dependency or effective
   CI input stops the affected action until its facts and evidence are refreshed under the existing rules.
   Preserve partial/uncommitted work; do not reset it to make the preflight pass.
4. Resume the exact saved ID on the surface already in operation. CLI: `codex resume <SESSION_ID>`;
   automated CLI: `codex exec resume <SESSION_ID> "<bounded next action>"`; app-server: `thread/resume`
   with that ID followed by the bounded turn; app/Work: reopen the same conversation. Verify installed
   command support and retain the existing sandbox/approval configuration. A failed resume is a hold or
   an explicitly recorded successor, not silent fallback to a fresh session.
5. Append only new instructions and changed facts. Refer to authoritative files rather than copying old
   transcripts. Keep stable instructions consistent where natural, but always refresh changed policy.
6. Recover acknowledgement/integration state from durable result IDs before acting. Resume/receipt replay
   must not duplicate dispatch, acknowledgement, merge, migration reservation or any other action. Same
   session ID is not an idempotency mechanism. Never queue this work behind a founder STOP as if issued.

## Required receipt block

Append this block to the **existing task receipt or its queue-owned evidence**, not to a new session
database or dashboard. The existing owner writes it; builders do not gain permission to edit protected
queue files. Populate real values before a resume; `unknown` documents a gap and is not permission to
resume without identity/scope. Link the block from the existing task/result record.

```yaml
session_record_version: 1
task_id: unknown
project: unknown
role: unknown
thread_id: unknown
surface: unknown                 # codex-cli | app-server | Codex app | Work
host: unknown
authorised_route_ref: unknown    # local reference only; never credentials
repository: unknown
integration_target: unknown
integration_target_revision: unknown
worktree: unknown
branch: unknown
starting_base_revision: unknown
source_pin: unknown
candidate_revision: unknown
last_validated_revision: unknown
allowed_files_ref: unknown
governing_contract_ref: unknown
model_requested: unknown
effort_requested: unknown
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
last_completed_turn: unknown
last_receipt_ref: unknown
state: unknown
resumed_from_thread_id: unknown
successor_reason: unknown
preflight_ref: unknown
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: unknown
review_evidence_ref: unknown
accepting_actor: unknown
acceptance_evidence_ref: unknown
outstanding_holds: unknown
builder_finished_at: unknown
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```

Preserve requested and runtime-confirmed model/effort separately. Record actual last completed turn and
current state after interruptions. A fresh receipt does not carry acceptance from a different candidate.
Where machine-validated receipts reject extra fields, use an already permitted evidence reference to the
block; schema/runner changes need an issued, reviewed leaf. Do not insert fields into signed manifests.

## Usage and the first ten real resumptions

For up to ten representative real resumes, append one entry per unique `(task_id, thread_id, turn_id)`
to the same task's receipt. The coordinator counts those entries through existing queue references. Record
multi-hour/overnight cases as they naturally occur; do not repeat builds to manufacture a sample.

Capture the raw source field names, source reference, turn ID, timestamp and whether counts are per turn
or cumulative. Record `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`
and `reasoning_output_tokens` when emitted. Unsupported/missing values are `unknown`, not zero. For a
source named `cached_tokens` or another shape, retain the original path and document the mapping; never
infer cache reads from total input. Do not add cumulative counters across receipts or count the same turn
twice. Keep logs private and omit credentials, sensitive prompts and account identifiers from public logs.

For comparable counters with `input_tokens > 0`, report cache-read share as cached input / input and fresh
input as input minus cached input. Report cache writes and output/reasoning separately, without double
counting nested reasoning tokens. Invalid/incompatible counters mean impact unverified. These quantities
are not subscription quota saved. Record actual allowance change only if exposed on the same route/window.

Also record resume-to-first-useful-work time; builder-finished → acknowledged → integrated times; accepted
leaves, repair rounds, CI/review queue age and current wait reason. Compare similar work classes, explaining
model/task differences. After ten natural resumptions the coordinator reports whether the milestone's real
bottleneck changed. V5's existing measured decision rule controls any later slot change.

## Acceptance and source limits

Policy installation is distinct from runner implementation. Before claiming automated implementation,
show: same ID after restart with role/project/worktree mapping; stale target/pin and missing scope rejected;
duplicate replay causes no second action; unrelated leaf gets a new session; reviewer stays independent;
cache reads are distinct from total input and missing from zero; unchanged complete CI, fresh environment,
candidate identity, security, review, acceptance and human gates. Bind checks and the actual Claude verdict
to the precise implementation candidate.

No new API caching configuration, `12h` TTL, paid fallback, account change, runner, provider, migration,
automatic merge or public saving claim is authorised. Cache behaviour is a service property, not a larger
context window. Compaction still requires durable source revalidation. Cache hits and subscription savings
remain unverified unless actual evidence establishes them.

Commands were checked on 21 October 2026 against installed `codex exec resume --help` and the
[official CLI reference](https://learn.chatgpt.com/docs/cli/reference). App-server method:
[official app-server documentation](https://learn.chatgpt.com/docs/app-server). API cache mechanics and
separate paid TTL settings: [official prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching).
That API guide does not prove a signed-in Codex/Work persistent-cache or quota guarantee.
