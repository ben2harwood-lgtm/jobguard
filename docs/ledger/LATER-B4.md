# LATER-B4 — Immutable storage version contract

Built locally against `origin/main` / HEAD `7ff452eeec1c523345d34715adfa3f8310062013`.
The dispatched `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb`
bases are superseded by this available main; main controls the implementation.

L044: the adapter rejects absent, empty, whitespace-only and literal `null`
versions before signing, HEAD, GET or deletion. Both returned HEAD and GET version
IDs must equal the requested immutable version. Refusals retain the existing
`MissingObjectVersionError` / `MISSING_OBJECT_VERSION` contract.

L045: known SHA-256 vectors and changed bytes exercise the real hash function.
Real adapter reads return retrieved bytes and their measured length despite
different provider metadata; hashing those bytes produces the known digest.
Only the external SDK transport/client and presigner are mocked.

L046: actual adapter method calls cover invalid versions, valid version-specific
commands, and upload signing. No real storage request or deletion was performed.

Tests first: 10 failed / 20 passed before the fix; 30 passed after it.
No migration, grants, database/API/UI changes, new alerts or provider changes.
Existing hash behavior and valid-version call signatures are preserved; callers
using mutable or invalid versions now receive the existing typed refusal.

Partial handoff: `config/lanes/later-b4.json` is absent and needs coordinator
registration. Independent Opus review and separate acceptance remain outstanding.
See [builder receipt](../verdicts/LATER-B4/BUILDER_RECEIPT.md) for commands and limits.
