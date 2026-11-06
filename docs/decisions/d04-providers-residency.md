# D04 — Providers and residency

- **Status:** `proposed`
- **Owner / required approver:** Data/security owner
- **Policy version:** `provider_residency_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** Real-data pilot and production; EU/UK personal-data boundary with UK-primary deployment
- **Source / supporting review:** `BUILD_PLAN.md` §4 and Appendix C; `AGENTS.md` §5.11 (rev 3.0); current vendor deployment evidence and data/security review required
- **Executable feature gate:** `G1, G3, the applicable track gate (G4-C or G4-S) and G5 as applicable; provider_dispatch requires D04 through requireApprovedDecision`

## Exact proposed policy

Personal data may use only individually verified EU/UK processing, storage and logging routes, with no silent global fallback. Approval must enumerate actual AI, speech, authentication/commercial email, telemetry, OCR, sync, object/backup, banking, payment and accounting destinations, subprocessors, retention/training and deletion behavior.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.

## M2-2 dark inbound-intake seam (29 October 2026)

`FakeMerchantIntakePort` is an unregistered, in-process test adapter, restricted by
`JOBGUARD_ENV=synthetic_demo`; unset, pilot and production values refuse every entry point.
It accepts only fixed fictional fixture IDs and `.invalid` sender/alias bindings supplied
by the server-owned test setup. No mailbox, SMTP/IMAP, inbound HTTP endpoint, credentials,
outbound email, remote-URL fetch, OCR or external storage route is implemented or approved.
Original fixture bytes, SHA-256 hashes, synthetic object version IDs, source pages and
receipt records stay in memory for the lifetime of the fake; there is no external storage,
processing, logging, subprocessor, training or retention destination. Nothing is logged.
Synthetic version IDs prove this adapter contract, not S3 verification or durable evidence.
No new dependency or migration is required. Live intake remains behind D04 and G2 and needs
an approved provider/data-flow entry, durable storage and command processing, real attachment
inspection and release evidence before it can be registered. This entry grants no approval.
