# CH-5 stage-end sweep: reject chained imports

RED. Synthetic data only. Migration 0566 replaces the checked invoiced-import
writer with the same definition plus one source-provenance guard after its source
row lock. An imported source raises IMPORT_ALREADY_ADOPTED before any write.
The application checks the same condition after ownership verification, including
preview and direct mutation. Reading an imported job and replaying its original
source command remain valid. No grants, tables, policies or historical rows change.
The complete function definition is repeated because PostgreSQL replaces a function
body as a unit; all existing authorization, insert-permit and idempotency checks
are retained. No new live admission, fees, providers or production behavior.

Already fixed on fetched main: CH-4.spec asserts the close reason and exact event
kind sequence. The invoiced import's meterResultRef is stored as the unique
meter_exclusion_id in the immutable app.job_import_v3 aggregate (0362), as described
in docs/contracts/job-import-v3.md. It refers to that zero-count exclusion, not a
live-meter computation. A targeted lookup regression now resolves the receipt's
reference to its same-tenant job/command/reason/count row; no second exclusion
store or rewritten historical receipts are needed.

Local scripted-transport regression fails before the guard and passes afterward.
PostgreSQL CI covers direct-writer denial, unchanged effects after chained attempts,
receipt replay, exclusion lookup, fresh migration install and upgrade preserving
existing import rows and writer owner/security/search_path/ACLs. Database/browser
execution is reserved for CI because this sandbox cannot start PostgreSQL or bind
localhost. Independent RED review and green CI remain required.

Forward fix: add a successor migration if necessary. Preserve the immutable imports
and their original receipts. Do not edit 0362 or rewrite old ownership/audit chains.
