# Customer request binding v1

LP-6D-CUSTOMER-PROOF, RED, synthetic only. This contract is separate from a member
binding and does not authorize a real-user launch.

A customer binding proves possession of the verified, live customer portal session
credential for exactly one customer, tenant and job. The protected transaction row
has kind `customer`, actor_id = customer ID, and session_ref = session ID + job ID.
It is scoped to the current database environment and transaction, expires with the
session, and cannot replace or coexist with a member binding. Credentials are not
stored in bindings, receipts, errors or audit payloads.

Only identity.customer_portal_message may enter this path. Its first operation
binds the customer, using the existing customer_portal_use resolver and its
revocation/party locks. It revalidates after waits and before returning even on
replay. A member-bound transaction cannot use it. Member accessors refuse customer
bindings, so a customer cannot enter any member routine or shared member command
boundary. Knowing a sponsor membership ID never supplies customer authority.

The grant issuer is a sponsor, never the actor. Store sponsor_membership_id
separately from customer_id and session_id. Audit actor_ref is customer-session:<ID>.
Do not write a member command_receipt or customer_message_source row for a customer:
those immutable formats require member actors. A new immutable, tenant-isolated
customer_portal_message_record stores the customer receipt, exact bytes and verified
version-specific evidence, with its own unique tenant/command identity. Existing
member-created messages and their history remain unchanged. Builder reads and
observation reads include both kinds, explicitly preserving customer provenance.

Exact replay requires the same session, customer, tenant, job and content. Changed
content or another principal reusing a command ID conflicts; revoked/expired
sessions cannot replay. A new message after final lock is refused; existing
history may replay after current credential verification. No approval, price,
fee, commercial send, hidden signal or member authority is created.

CI must exercise forged credentials, other customer/job/tenant, both cross-kind
refusals, expiry/revocation, concurrent replay, changed payload, post-lock behavior,
transaction reuse/rollback and actual grants/catalogue posture. Source checks are
not database proof. Independent RED review and predecessor catch-up remain gates.
