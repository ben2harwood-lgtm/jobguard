# Q08 · V2-E2: replies tied to the one fact they answer

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; outside answers). Migration **2013**. Astra: yes. Rework risk: **high** (E1 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e2.
**Starts:** PARKED (25 Nov 01:10 UK, planner miss, one round left). Restart tomorrow from this rewritten packet; Ben decides on rounds. Was: now. **Base:** E1's branch `claude/project-thread-vur4ba` (#919). Draft PR against it. Merge E1 again when it moves. Do not edit E1's files, except the one `commandIn` extraction described below; answer facts through E1's commands.

## Dry-check against the code (planner, 25 Nov 00:15 UK): verified with one change; the mock-up passed (#930)
- **E1's answer needs a signed-in builder.** E1 (#919) has `v2-open-fact-command.v1` with actions `log`, `answer`, `cancel` and `mark_out_of_date`, each with `expectedVersion`. Its repository refuses without a signed-in editor (`OPEN_FACT_EDITOR_REQUIRED`), so the no-sign-in reply page **cannot** call E1's `answer` itself, and you may not edit E1.
- **So the reply page records the reply in E2's own table** (answer, fact version it answered, source `reply_link`, time). The builder then sees "Reply received: apply?", and **the builder's press** calls E1's `answer` with the fact's current `expectedVersion`. A pasted WhatsApp or phone reply works the same way with source `pasted_by_builder`. E1's own `source` stays `builder_logged`; the reply source lives only in E2's table.
- **Older versions:** a reply to an older fact version is kept as out of date and offered to the builder as out of date, never applied automatically.
- **Customer link rule (rule 16):** the reply page copies the existing customer job link's anonymous-access check, not F6's.
- **Event names (rule 18):** `v2.fact_reply.requested`, `.received`, `.cancelled` and `.applied_by_builder`. Don't use "accepted" or "completed".
- **Migration:** `packages/db/migrations/2013_...sql`.
- **Applying a reply in one transaction (planner decision, 25 Nov 00:50 UK, after build round 1 held).** E1's `command()` opens its own `withTenant` transaction (`v2-open-fact-repository.ts` lines 194 to 225 on #919), so calling it from E2 would make two transactions. A fact could then end up answered with no `applied_by_builder` record. **Decision: a small, behaviour-free extraction in E1's repository, made in this PR.**
  - Move the body of `command()` into a public `commandIn(database: TenantTransaction, context, jobId, sessionId, input)` that runs inside a transaction the caller already holds. `command()` becomes `withTenant(this.pool, context, database => this.commandIn(database, context, jobId, sessionId, input))`. Nothing else in E1 changes: not the editor check, replay, race handling, audit or error codes.
  - E2's apply runs inside **one** `withTenant`. In it: lock E2's reply row, check it is unapplied and current, call `openFacts.commandIn(database, ...)` with `action: "answer"` and the fact's `expectedVersion`, write `applied_by_builder` and its audit event, then commit. A failure anywhere rolls back both.
  - Use E2's reply id as E1's `commandId`, so a retried apply replays in E1 and E2 instead of answering twice.
  - **Lane:** add `packages/db/src/v2-open-fact-repository.ts` to E2's lane file with the note `"extract commandIn only, owned by E1 #919, no behaviour change"`. Say so in the PR body. E1's existing tests must pass unchanged, and you must not edit them.
  - **Tests:**
    - a forced failure after E1's answer and before E2's record leaves the fact unanswered and no E2 record or audit event;
    - a retried apply answers once;
    - a stale fact version refuses both writes.
  - **Rejected:** a deterministic command id plus a later recovery check. It leaves a window where the fact shows answered with no E2 record, and it adds repair code that the rules would need tests for.
  - If #919's owner changes `command()` again, merge E1 again and redo the extraction the same way.

## Rewrite against the real E1 contract (planner, 25 Nov 01:10 UK; this overrides earlier lines about "options")
Checked on #919: E1 stores **no answer options**.
- The `customer_choice` detail is `{question, mayChangePrice}` (`v2-open-fact-repository.ts` lines 23 to 27), and migration 2009 has `choice_question` but no options column.
- E1's answer for that kind is `{choice: text(500), mayChangePrice}`.
- The other kinds answer with `deliveryDate` (a date), `available` (true or false) and `arrangement` (text, 500 characters).

**E1 is not changed.** E2 owns the options:
- **Where the options live.** E2's reply request stores the builder's offered options **in E2's own table** when the request is created: 2 to 6 short labels (max 80 characters each), in a fixed order, plus a flag for whether "something else" is allowed (free text, 500 characters).
  - They are part of the request's version and digest. Changing them makes a new request.
  - Options apply only to `customer_choice`. The other kinds take no options.
- **The reply page by kind:**

  | Kind | Page shows | Answer |
  |---|---|---|
  | `customer_choice` | E1's question and E2's stored options | One option, or the "something else" text if allowed |
  | `merchant_delivery_date` | E1's item | A date |
  | `crew_availability` | E1's need | Yes or no |
  | `access` | E1's need | Text (500 characters) |

- **Mapping to E1's answer** when the builder applies:
  - `choice` = the chosen label, or the free text
  - `mayChangePrice` = E1's fact value, copied unchanged
  - `deliveryDate`, `available` or `arrangement` = the reply as given
- **Validation.** The submitted option must be one of that request's stored labels (exact match). If the fact's version moved after the request was made, the reply is kept as out of date (unchanged rule).
- **Tests.** In addition to the existing ones:
  - an option not in the stored list is refused;
  - changing the options makes a new request, and the old token's reply is out of date;
  - each kind's reply maps to E1's answer schema and passes E1's own parser;
  - "something else" is refused when the request doesn't allow it.
- **Unchanged:** the `commandIn` one-transaction apply described above, migration 2013, rules 16, 18 and 21 to 23.

## Screen files and mounts (planner, 25 Nov 00:25 UK; copy this wording verbatim into the builder's brief)
The no-sign-in reply page is a **new route file you own**: `apps/web/app/reply/[token]/page.tsx`, which is V2 only and returns 404 when the flag is off. **One mount is allowed**, in `apps/web/app/(designed)/jobs/[id]/work/page.tsx` only: one import line plus one element, rendered only when `process.env.JOBGUARD_LOCAL_V2 === "1"`. Add that file to your lane file with the note `"mount only, owned by main (live Work tab)"`. Change nothing else in that file. It is used only for the builder's "Replies received: apply?" section, which goes in a new component file you own. This overrides any other line in this packet or brief about editing screen files.

## Goal
A reply from a customer, merchant or crew member is tied safely to firm, job, verified recipient, the one open fact it may answer, the request version, an expiry and a way to cancel.

## Scope
- Table of reply requests: fact (E1), recipient (role and contact as recorded), request version, single-use reply token stored as a hash, expiry, cancelled. Builder creates and cancels (audit event each).
- A reply page by token (V2 only, no sign-in): shows only that one question and its options, records the answer once in E2's own table. The builder then applies it to E1's fact through E1's `answer` command (see the dry-check note).
- Requests are "sent" **only to the local catcher**. Also allow the builder to paste a reply received by WhatsApp or phone as the answer (plan section 9 point 3), recorded with source "pasted by builder".
- Answer from a request for an older fact version: kept as out of date, not applied. Expired or cancelled token: refused plainly.

## Done when
- A duplicate reply is recorded once and can be applied once; a reply to an old request is kept as out of date and not applied; another firm's token or fact is refused; expired and cancelled tokens are refused.
- The catcher holds exactly one message per request; nothing goes anywhere else. Audit events for create, cancel and applied answer. CI green apart from Vercel.
