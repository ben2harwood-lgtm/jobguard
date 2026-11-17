# 0472 — CH-5 pre-adoption catch (RED)

Adds one immutable, tenant-isolated historical-evidence register. The writer
accepts a command identity and an existing finalized original evidence identity;
it loads the exact job, object version, hash, receive time and builder-attested
capture time from storage. Capture metadata is not proof of when work occurred.
Only a source strictly before the persisted adoption time can be stamped
`pre_adoption_evidence`. Missing, contradictory or invalidated sources refuse.

Both entrypoints reauthenticate the exact adopting session and current owner.
The register is unreadable and unwritable by runtime/shadow roles; only the
checked migration-owned routines access it. Composite foreign keys bind its
source to the same tenant, job and immutable object. A deferred audit reference
and deferred content guard require the exact actor/job/source/history audit
event in the same transaction; an unrelated audit identity cannot satisfy it. The job lock precedes
the audit-head lock. Replaying a command returns its original identity without
another audit event. Changing that command's source refuses; a different command
cannot register the same original again.

The imported-catch v2 adapter binds the stored baseline and historical evidence
using the original history command identity (not a fresh command),
and returns `fee: { pence: 0, currency: 'GBP' }`, the permanent reason and stable
catch identity. This is an exclusion assessment, with no commercial effect.
The v1 catch command and the unconnected positive SV-6 path retain their refusal.
The existing public catch endpoint accepts v2; the current import screen still
uses v1. Historical upload UI and imported final-account assembly are outside
this adapter. No new upload endpoint or provider is installed.

A shadow-source INSERT guard independently checks the original's capture time
against adoption and refuses historical sources even if a caller drops the
classification or re-uploads the registered bytes with a new capture time.
Hash matching stays within the same tenant and job. No existing routine is restated. No recovery case, claim,
allocation, lock, invoice or fee posting is created or rewritten.

Fresh-install/concurrent replay/isolation/invalidation and catalogue/upgrade
checks require PostgreSQL CI. Local checks and their results are in the commit
message. Independent RED review and green CI remain required.

Forward fix: add a new migration to repair the routines, preserving all existing
register rows, classifications and audit references. To disable the capability,
revoke the two runtime EXECUTE grants; never relabel or remove historical rows.
