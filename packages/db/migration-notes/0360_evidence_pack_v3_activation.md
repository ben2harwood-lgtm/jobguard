# 0360 — CH-8 part 3 RED synthetic activation

Replaces the held request/writer bodies with the checked implementations and extends the private
post-lock inventory with SV-6's stored allocation facts, exact invoice bindings, payment and adjustment
history. Existing table keys, RLS, grants, artifacts and approvals remain intact. No backfill or real
provider action. The runtime still cannot query hidden material or call the worker writer.

Apply after all predecessors, including 0340. The upgrade test installs the actual predecessor,
populates business rows, applies only 0360, compares row/type/primary-key preservation, then exercises
successors and migration reruns. Fresh-install, PostgreSQL and browser suites run in CI.

0306 is restored byte for byte to PR #389; all activation and disclosure changes live in 0360.
Reveal/disposition proofs are limited to this case's catch and a reveal classification. Processing
source and attempt records contain IDs/hashes only; the run binding omits classifications. Ordinary
catch-origin records are limited to this case, preventing another catch's signal ID from leaking.
To stop creation, disable the v3 entry points/worker and forward-fix these routines to refuse again;
retain every historical request, artifact and approval. No destructive rollback.
