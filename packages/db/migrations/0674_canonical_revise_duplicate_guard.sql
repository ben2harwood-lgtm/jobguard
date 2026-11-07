BEGIN;
-- LATER-SAFETY-132: keep an approved duplicate's canonical billable until explicitly unlinked.
-- Guard the revision table so later replacements of xa_price retain this invariant.
CREATE FUNCTION app.canonical_revise_duplicate_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app.extra_origin x
  WHERE (x.tenant_id,x.job_id,x.variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)
   AND x.job_track='contractor') THEN RETURN NEW; END IF;
 -- Same job lock as xa_begin and duplicate link/unlink; already held on the pricing path.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,417));
 IF EXISTS (
  SELECT 1 FROM app.extra_duplicate_link l
  JOIN app.extra_approval_request q
   ON (q.tenant_id,q.job_id,q.variation_id)=(l.tenant_id,l.job_id,l.duplicate_id)
  JOIN app.extra_approval_outcome o
   ON (o.tenant_id,o.request_id)=(q.tenant_id,q.id) AND o.kind='approved'
  WHERE (l.tenant_id,l.job_id,l.canonical_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)
   AND l.kind='link'
   AND NOT EXISTS (SELECT 1 FROM app.extra_duplicate_link u
    WHERE (u.tenant_id,u.job_id,u.reverses_link_id)=(l.tenant_id,l.job_id,l.id) AND u.kind='unlink')
   -- The duplicate event masks xa_latest_kind, but does not erase its immutable approval.
   AND q.request_revision=(SELECT max(r.request_revision) FROM app.extra_approval_request r
    WHERE (r.tenant_id,r.job_id,r.variation_id)=(q.tenant_id,q.job_id,q.variation_id))
 ) THEN
  RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.canonical_revise_duplicate_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.canonical_revise_duplicate_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER canonical_revise_duplicate_guard BEFORE INSERT ON app.variation_revision
 FOR EACH ROW EXECUTE FUNCTION app.canonical_revise_duplicate_guard();
-- Forward fix only; unlink through the existing authorized command before revising.
COMMIT;
