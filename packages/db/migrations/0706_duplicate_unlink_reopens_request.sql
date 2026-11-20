BEGIN;
-- LATER-SAFETY-78: reversing the link does not erase its terminal duplicate outcome.
-- Open a fresh request only when that exact link closed the latest request.
-- Earlier approvals/decisions remain immutable; the new request starts its chain again.
CREATE FUNCTION app.xa_reopen_unlinked_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_req app.extra_approval_request; v_revision uuid;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt c
   WHERE(c.tenant_id,c.command_id,c.actor_membership_id)=(NEW.tenant_id,NEW.command_id,NEW.actor_membership_id)
    AND c.command_type='UnlinkDuplicate' AND c.status='processing') THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- The link's existing BEFORE guard owns authority, graph locks and export refusal.
 SELECT q.* INTO v_req FROM app.extra_approval_request q
 WHERE(q.tenant_id,q.job_id,q.variation_id)=(NEW.tenant_id,NEW.job_id,NEW.duplicate_id)
 ORDER BY q.request_revision DESC LIMIT 1;
 IF v_req.id IS NOT NULL AND EXISTS(
  SELECT 1 FROM app.extra_approval_outcome o JOIN app.extra_duplicate_link l
   ON(l.tenant_id,l.job_id,l.duplicate_id,l.command_id)=(o.tenant_id,o.job_id,o.variation_id,o.command_id)
  WHERE(o.tenant_id,o.request_id,o.kind)=(NEW.tenant_id,v_req.id,'duplicate')
   AND l.id=NEW.reverses_link_id AND l.kind='link'
 ) THEN
  SELECT b.variation_revision_id INTO v_revision FROM app.extra_approval_revision_binding b
   WHERE(b.tenant_id,b.id)=(NEW.tenant_id,v_req.binding_id);
  PERFORM app.xa_open_request(NEW.tenant_id,NEW.job_id,NEW.duplicate_id,NEW.command_id,
   NEW.actor_membership_id,v_req.binding_id,v_revision,v_req.revision_hash::text,v_req.net_pence);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.xa_reopen_unlinked_request() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_reopen_unlinked_request() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER reopen_unlinked_request AFTER INSERT ON app.extra_duplicate_link
 FOR EACH ROW WHEN (NEW.kind='unlink') EXECUTE FUNCTION app.xa_reopen_unlinked_request();
-- Forward repair: retain append-only history. Roll back behaviour by disabling this
-- trigger in a reviewed follow-up; do not remove requests already opened by it.
COMMIT;
