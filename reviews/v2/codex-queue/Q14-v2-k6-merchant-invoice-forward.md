# Q14 · V2-K6: forward a merchant invoice to the job

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `/mnt/project-files/audits/build-rules-checklist.md` (version 1) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (inbound documents routed to a firm). Migration **2023**. Astra: yes. Usefulness **high** (full value with K6B), effort **S** for K6A. Rework risk: **low** (base merged).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k6, section 2A item 4. Practice slice of BUILD_PLAN.md M2-2 and SV-7B; a real inbound mail provider is Ben's later call (D04).
**Starts:** now. **Base:** `v2/main`. Stock effects (E3) are left out, so it does not wait for E3.

## Change, 24 Nov 22:15 UK: cut to K6A (routing only)
Codex stopped correctly: on v2/main, `supplierDocumentIntakeV1` (`packages/core/src/supplier-documents.ts`) only accepts a `fixtureId` from a fixed list and refuses `attachmentPath` and `remoteUrl` (`z.never()`), and `SupplierDocumentRepository.intake` hashes bundled fixture bytes. So the existing intake cannot take a forwarded file, and widening it is a RED change to the money-document path. This packet is now **K6A: the inbound address and routing**, built on the intake exactly as it is. **K6B**, accepting a real forwarded PDF or image (type and size checks, malware-safe storage, hashing the received bytes, BUILD_PLAN.md SV-7B), is a separate later packet that goes to Astra before anyone builds it.

## Goal (K6A)
Each firm gets one inbound address. A forwarded merchant email reaching it is routed to the right job, or waits in "needs a job", and is filed as a supplier document through the **existing intake, unchanged**, using channel `fixture_mail` and the practice fixture named by the catcher message. That proves the address, the matching, the tray and the firm boundaries now; real files come with K6B.

## Scope (K6A)
- Table: firm inbound address (random local-part, stored), and inbound items (received at, sender, subject, the practice `fixtureId` the catcher message names, matched job or "needs a job", filed by, the supplier document ID once filed). One audit event per command (address create, file to job, dismiss).
- Practice only: a **local inbound catcher** (a test route or folder the V2 launcher reads) stands in for real mail. Each practice message names one existing `supplierFixtureIds` value; a message without one, or with an attachment, is stored as "needs K6B" and never filed. No real mail provider.
- Filing: match a job by a job reference in the subject or body, or by a supplier already on the job; otherwise it waits in "needs a job" for the builder. Filing calls the existing `supplier-documents/intake` with `channel: "fixture_mail"` and that `fixtureId`. **Do not edit `supplier-documents.ts`, the intake schema or the repository.** If you need to, stop and report.
- Unknown sender: always waits for the builder. Another firm's address never files into this firm.

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Ambiguous supplier.** A known supplier who serves two of the firm's jobs, with no unique job reference in the message: exactly one held item, zero supplier documents and zero stock changes until the builder picks a job.

## Done when (K6A)
- A practice forward with the job reference files to that job through the unchanged intake and reaches the three-way check; one without a match waits; an unknown sender waits; a message with a real attachment is held as "needs K6B" and nothing is filed; mail to another firm's address never appears here; a duplicate forward files once; second-firm and audit tests per the rules; `git diff` shows no change to `packages/core/src/supplier-documents.ts`. CI green apart from Vercel.
