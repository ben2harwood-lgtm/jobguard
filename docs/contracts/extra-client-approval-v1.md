# Extra client approval constraints v1 — foundation only

Source: **BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13**, 13 October 2026, at `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`.

Q10: “Approve each send; expire links; cancel replaced requests.” The pure specimen contract binds each send identity, recipient `.invalid`, pack hash, revision and explicit expiry to its own approved decision specimen. Different sends cannot reuse approval. Expired links refuse eligibility; replacing a request marks its predecessor cancelled. These are constraints, not a capability issuer, outbox executor or authenticated access decision.

Q13: “Allow named fictional roles; record who actually acted.” The fixture attribution explicitly names the fictional client role and the actual tester separately; neither may be omitted. A fictional label is not an actor or authentication assertion. No identity provisioning, owner impersonation or anonymous approval flow is introduced.

Q14: “Keep history; stop future actions and cancel unused permission.” Retained history does not grant future action, read access or export eligibility. Unused authority is cancelled after authority loss.

HELD: Q10 sending/cancellation roles, exact lifetimes, resend/unattended semantics; Q12 post-consumption retries and historical access; Q13 concrete session/authentication/provisioning bridge and its exact lane; Q14 export and refusal-audit rules; Q15 executor/scheduler boundary. Client invitation, sign-in, link storage/use, queue, endpoints and UI remain unbuilt. Pure fixtures are not a sign-in journey. Approval ultimately permits billing export only, never invoice issuance or charges. No production or pilot capability is enabled, no real recipient is permitted, and no commercial decision is recorded.
