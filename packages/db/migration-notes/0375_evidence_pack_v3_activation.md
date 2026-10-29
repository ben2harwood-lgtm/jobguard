# 0375 — CH-8 part 3 RED synthetic activation

Replaces the held request/writer bodies with the checked implementations and extends the private
post-lock inventory with SV-6's stored allocation facts, exact invoice bindings, payment and adjustment
history. Existing table keys, RLS, grants, artifacts and approvals remain intact. No backfill or real
provider action. The runtime still cannot query hidden material or call the worker writer.

Apply after all predecessors, including 0340. The upgrade test installs the actual predecessor,
populates business rows, applies only 0375, compares row/type/primary-key preservation, then exercises
successors and migration reruns. Fresh-install, PostgreSQL and browser suites run in CI.

0306 is restored byte for byte to PR #389; all activation and disclosure changes live in 0375.
Reveal/disposition proofs are limited to this case's catch and a reveal classification. Processing
source and attempt records contain IDs/hashes only; the run binding omits classifications. Ordinary
catch-origin records are limited to this case, preventing another catch's signal ID from leaking.
To stop creation, disable the v3 entry points/worker and forward-fix these routines to refuse again;
retain every historical request, artifact and approval. No destructive rollback.

CI repair try 2: parenthesize `(envelope->'manifest')` before subtracting the allowed-key
array. PostgreSQL gives subtraction higher precedence than JSON extraction; without the
parentheses it tries to parse the text `manifest` as JSON. This changes this unmerged
migration's SQL bytes to repair execution, preserving the exact allowed-key validation.
No migration already on main is edited. No CASE is inside an IF condition in this migration.

Round 4: the post-lock binding variable is declared as RECORD, populated only after
the pre-lock return. This removes the hidden-table row-type dependency from the
ordinary branch without changing its queries or the strict SB-02 regression. The
0360 -> 0375 rename follows the explicit round-4 brief; all other SQL bytes remain
unchanged from that brief's starting head.
