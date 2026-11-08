# Company Final Check database v1

DEMO-S / MON-3 · RED plus second security check · dark database subset of slice 1.
No web/API route, live provider, production authority or browser journey is added.

Decision: “accept slice 1 only, exactly as section 2 and section 4 slice 1 of the design describe.” The brief explicitly permits named holds for omitted entry points. This subset does not finish the full slice-1 acceptance list or DEMO-S.

Migration 0951 adds six runtime-executable, migration-owned definer routines: company_final_check_read, company_final_check_terms, company_final_check_disposition, company_final_check_lock, company_final_check_request_run and company_final_check_reveal. The private invoker helper company_final_check_authority has no runtime EXECUTE. No existing function/caller changes; no new tables, SELECT grants, roles, memberships or shadow grants. Only the six named runtime execution grants are added.

Each entry point reads app.bound_context_reader(). The helper compares that internal pair with a fresh reader result using IS DISTINCT FROM; NULL refuses. It requires the synthetic database, READ COMMITTED, runtime login authority, matching transaction tenant, current owner membership and a tenant-owned small-builder synthetic job. Job, variation and membership locks precede fresh binding/deadline/membership checks and legacy replay. Terms acquires its legacy advisory lock before those checks. The repository uses session-bearing withTenant, binding first; strict versioned inputs accept no supplied actor, tenant or kind. Queued-job/unbound contexts cannot supply authority.

The reader exposes no credential kind. Under current LP-6b, home practice binds only the two fixed practice tenants, while contractor practice binds only recorded contractor-session tenants. All these tenants, including historical contractor sessions, plus practice-company markers are refused. This conservative exclusion proves that a surviving binding uses the real resolver without widening the reader; it also refuses a real session in any tenant with historical contractor practice. Resolver changes require reviewing this invariant. Settings never establish kind. Session revocation is fenced by LP-6b's SHARE lock through transaction completion; membership and binding expiry are rechecked after waits.

Practice-owned jobs and their imported descendants are refused through tenant-qualified recursive ancestry over job_import_v3, successful adoption receipts and baseline-attestation audit events. UNION terminates cycles. Missing or external ancestors refuse without reading another tenant. Existing synthetic track, terms, source, proof/upload, immutable-lock and completed-run gates remain. Lock exact replay returns the same stored row; changed payload conflicts and competing locks serialize. Run request writes only identifiers into the existing queue after lock and terms; requested is not completed.

Reveal copies the latest 0262 algorithm into its separate company entry point. The fixed unlocked response is exactly {"state":"unlocked","items":[]} before any hidden relation access. Read, terms and scope operations never query hidden relations. Completed results still require the immutable run binding and valid sources. No company catch confirmation, hidden-signal disposition, attribution, fee, statement or collection authority is included.

Named holds for landing:

- Company assemble: omitted. Existing assembly is TypeScript orchestration with a supplied actor and direct writes, not a SQL assembly routine. Invoking it through the new SQL boundary needs a changed existing caller or a separate calculator/write contract. Neither is introduced. Integration setup uses the existing assembler with fictional baseline and verified proof solely to prepare a draft; it is not new company assembly proof.
- Company structured sources: 0295's supplier/purchase-order source-current checks remain practice-only. Evidence-object processing is separate. Requesting a company run does not make unsupported structured sources processable or completed; full processing needs a separate authorised worker change.
- **company request-run vs LS-142 attempt identity**: base identifier-only queue retained; reconcile with LATER-SAFETY-142 before landing. No attempt identity edits.
- Migration order: router must renumber placeholder 0951 after the bound-context reader (currently 0956). No existing registry, scanner, pin or grant-catalogue was edited. Any required scanner/pin adjustment is a landing hold.
- PostgreSQL CI and review: run new authority/upgrade tests and unchanged final-check, final-account, free-first-job, LP-6a/6b, grant and migration suites. Independent exact-head RED review and second security check remain required. The database mutation control is authored, restores the read function by rollback, and has not run locally.

Additive migration, no backfill. Failure rolls back all additions. Withdraw by dropping the six entry points then the helper without CASCADE; dependent callers must block withdrawal. Prefer a forward fix after downstream adoption. Existing practice and money history remain.

Slices 2–3, company illustration and fee illustration remain unbuilt. Local verification is recorded in the router commit-message handoff. Authored database tests are not executed database proof.
