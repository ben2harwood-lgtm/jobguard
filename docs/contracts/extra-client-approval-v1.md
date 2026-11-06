# Extra client approval constraints v1 — synthetic journey

Original source: **BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13**, 13 October 2026, at `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`.

Router rulings supplied by Ben on 4 November 2026 for ENT-5, recorded in `~/.local/share/full-steam/AGENT_CHOICES.md`:

- **Q10 resolved:** a surveyor or commercial manager with a current grant covering the job approves each exact request send. The approved action binds recipient, content hash, revision, net, currency, policy and expiry. The server route creates a seven-day link. Resending creates a separate invitation/request identity, cancels earlier unused links and pending/retryable outbox work, and requires a fresh explicit approval. No unattended sends. The approval-chain snapshot is unchanged by resend.
- **Q12 resolved:** a consumed sign-in link cannot create another session. The decision link supports one effect; the same command and exact decision return the stored outcome under current session/grant checks. A new command using a decided link is refused. While access remains active, an approver can read their own decisions on that job, including declines, and nothing wider. Expired, replaced and revoked credentials confer no new authority.
- **Q13 resolved:** reuse `/customer/sign-in`, `/api/customer-portal/signin`, the existing HMAC credential format and `jobguard_customer` session cookie. There is no anonymous approval or new sign-in method. Private companion rows bind an invitation to its named `client_approver` membership and server session. Each read and decision rechecks that membership's current client/contract grant. The actual named approver is the step/outcome/audit actor. Customer command provenance records their session; the practice owner/sponsor is not impersonated or recorded as the approver. The practice role-switch endpoint no longer authorizes client approval.

**Q14 remains HELD:** export eligibility and refusal-audit policy. History retention does not authorize future reads, actions or exports; current authority is required for history. Authority loss fails closed. No export capability or automatic permission-cancellation policy is introduced here.

**Q15 remains HELD:** executor/scheduler activation and escalation ownership. Invitations are durable approved `fake_email` outbox actions to `.invalid` recipients only. Existing fake-transport tests may exercise them; this piece starts no scheduler and enables no real provider, pilot or production delivery. A queued item is not delivery evidence.

Approval permits the contractor's billing-export path only, never invoice issuance, charges or payment authority. Existing timing derivation preserves uncertain visit bounds and `done_without_required_preapproval`; later approval does not erase a breach. No real customer data is permitted.

Implementation and local evidence, CI requirements and **Named holds for landing** are in `docs/verdicts/ENT-5/BUILDER_RECEIPT.md`. Protected scanner/pin changes require landing work and are not made by this branch.
