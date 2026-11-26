# 2053 · V2-F1-P (RED)

V2-only additive extension to 2015. Drops its reserved photo-null CHECK, adds the
tenant-qualified upload FK and an invoker-rights BEFORE INSERT same-job guard.
Existing grants, policies, live/stage triggers and append-only history are unchanged.
No table, runtime grant, authority routine or backfill is added. Apply twice in the
V2 seed suite and compare grants/policies before and after. The ordinary migration
runner leaves non-V2 databases unchanged; bootstrap applies it after 2015 and
before the final 2054 firm lock when integrated.

v1 observations remain supported; v2 optionally binds photoId. The upload action
uses generated PNGs only, the existing EvidenceService begin/finalize hooks and
private versioned storage. No real sends, camera bytes, paid calls or completion
claims. Each fresh upload phase appends its own v2 audit event transactionally;
begin and finalize use separate existing durable command identities, each with one
audit event. The EvidenceService verification internals remain unchanged.
Photo-bearing Done/Blocked/Changed each append one observation audit event, with
no additional event on replay. Verification state is read live, never copied into
progress. Retries preserve both the upload identity and the progress identity.

Forward fix: preserve observations and evidence; do not restore the null CHECK
while photos exist. Older v1 callers can continue recording without photos.
Pending V2-PX: this base lacks PX's firm policies for evidence. Do not merge until
PX is integrated and the second-firm evidence reads pass in the full V2 seed suite.
CI1 must execute database, migration and browser proofs; this sandbox cannot do so.
