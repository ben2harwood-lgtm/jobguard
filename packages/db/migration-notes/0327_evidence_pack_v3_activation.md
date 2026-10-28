# 0327 — CH-8 part 3 RED synthetic activation

Replaces the held request/writer bodies with the checked implementations and extends the private
post-lock inventory with SV-6's stored allocation facts, exact invoice bindings, payment and adjustment
history. Existing table keys, RLS, grants, artifacts and approvals remain intact. No backfill or real
provider action. The runtime still cannot query hidden material or call the worker writer.

Apply after all predecessors, including 0311. The upgrade test installs the actual predecessor,
populates business rows, applies only 0327, compares row/type/primary-key preservation, then exercises
successors and migration reruns. Fresh-install, PostgreSQL and browser suites run in CI.

0306 retains its fail-closed bodies; their unreachable code was moved into this forward activation.
To stop creation, disable the v3 entry points/worker and forward-fix these routines to refuse again;
retain every historical request, artifact and approval. No destructive rollback.
