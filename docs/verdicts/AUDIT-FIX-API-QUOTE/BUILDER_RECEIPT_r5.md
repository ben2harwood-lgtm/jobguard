# AUDIT-FIX-API-QUOTE builder receipt, round 5 (Sol REPAIR: changed retries)

Builder: Claude Sonnet 5.5. Base: head 2d384b04 (worktree was detached at it; it equals the remote branch). **Not independently verified, not accepted.**

## Fix (own files only; commands.ts untouched)
`packages/db/src/acceptance-repository.ts`: facts recorded only in the mutation payload are bound into the command's semantic key, which the dispatcher already fingerprints. Acceptance: statedMethod + acceptedAt (normalised ISO); disposition (cancel/decline/supersede): occurredAt. Customer name, document, hash, version, total were already in the fingerprinted envelope; evidenceId is always null. Key = existing key + `:f=<16 hex sha256 of the facts>`. A retry reuses the recorded key's sequence part with the current facts suffix, so identical replay succeeds and any changed fact gives COMMAND_CONFLICT. Keys recorded before this change (no suffix) replay exactly as before.
Side effect: two different-fact commands on the same sequence no longer collide on the semantic key; the DB routine (job lock, status, expected revision) still refuses the second (race test unchanged and passing).

## Evidence
- RED first: new test "a reused command id with a changed method, stated time or cancellation time is a COMMAND_CONFLICT" resolved instead of rejecting (log `red-evidence/red-r5-changed-facts.log`). GREEN after fix. Covers per field: method, acceptedAt, cancel occurredAt, first acceptance, identical replays unchanged with no new rows.
- Runs (heavy-slot, --maxWorkers=1, 3 files each, exit 0): reaccept main+evidence+upgrade 12/12; job-activation-terms+practice-session+recovery-case-terms-upgrade 25/25; migfix-4+migfix-4-upgrade+quote.integration 17/17; tenancy+demo-bootstrap+recovery-follow-up-upgrade 16/16.
- Not run: full CI, test:db, e2e. No merged expectation changed.
