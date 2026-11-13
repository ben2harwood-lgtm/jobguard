BEGIN;

CREATE OR REPLACE FUNCTION app.ent4b_fact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; origin_row app.extra_origin; prior_link app.extra_duplicate_link; origin_revision integer; instructed_revision integer; reconciliation boolean:=false;
BEGIN
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 IF command.command_id IS NULL OR command.status<>'processing' OR command.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Serialises the active-link graph and event sequences even for direct runtime SQL.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,417));
 NEW.server_recorded_at:=transaction_timestamp();
 IF TG_TABLE_NAME='extra_event' THEN
  IF EXISTS(SELECT 1 FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND job_track<>'contractor') THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  IF NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.variation_revision WHERE (tenant_id,job_id,variation_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.revision_id)) THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  NEW.sequence:=coalesce((SELECT max(sequence) FROM app.extra_event WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)),0)+1;
  IF (NEW.sequence=1) IS DISTINCT FROM (NEW.kind='logged') OR (NEW.kind='logged' AND NEW.command_id IS DISTINCT FROM origin_row.command_id) THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='extra_duplicate_link' THEN
  IF command.command_type='ReconcileExportedDuplicate' THEN
   reconciliation:=command.command_type='ReconcileExportedDuplicate' AND NEW.kind='link' AND EXISTS(
   SELECT 1 FROM app.enterprise_duplicate_correction c WHERE (c.tenant_id,c.command_id,c.link_id,c.job_id,c.duplicate_id,c.canonical_id,c.actor_membership_id)=
    (NEW.tenant_id,NEW.command_id,NEW.id,NEW.job_id,NEW.duplicate_id,NEW.canonical_id,NEW.actor_membership_id));
  END IF;
  IF EXISTS(SELECT 1 FROM app.variation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id IN(NEW.duplicate_id,NEW.canonical_id) AND job_track<>'contractor') THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.extra_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id IN(NEW.duplicate_id,NEW.canonical_id) AND kind='exported') AND NOT reconciliation THEN
   RAISE EXCEPTION 'EXTRA_EXPORTED' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='link' THEN
   IF NOT reconciliation AND (command.command_type<>'MarkDuplicate' OR command.semantic_key<>('extra-duplicate:'||NEW.job_id::text||':'||NEW.duplicate_id::text||':'||NEW.canonical_id::text||':'||NEW.command_id::text)) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id AND l.kind='link'
    AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE (u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))
    AND (l.duplicate_id=NEW.duplicate_id OR l.duplicate_id=NEW.canonical_id OR l.canonical_id=NEW.duplicate_id)) THEN
    RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514';
   END IF;
  ELSE
   -- Row guards only; no unlink receipt type, repository function or authorization rule in this leaf.
   IF command.command_type IS DISTINCT FROM 'UnlinkDuplicate' OR command.semantic_key IS DISTINCT FROM ('extra-duplicate-unlink:'||NEW.job_id::text||':'||NEW.reverses_link_id::text||':'||NEW.command_id::text) THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
   SELECT * INTO prior_link FROM app.extra_duplicate_link WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.reverses_link_id);
   IF prior_link.id IS NOT NULL AND (prior_link.kind<>'link' OR prior_link.duplicate_id<>NEW.duplicate_id OR prior_link.canonical_id<>NEW.canonical_id) THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF command.command_type<>'RecordClientInstruction' OR command.semantic_key<>('extra-order-line:'||NEW.job_id::text||':'||NEW.variation_id::text) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  -- Let the composite FKs produce 23503 on missing/foreign rows, before comparing revision numbers.
  IF EXISTS(SELECT 1 FROM app.work_order WHERE (tenant_id,id,job_id)=(NEW.tenant_id,NEW.work_order_id,NEW.job_id))
   AND EXISTS(SELECT 1 FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id)) THEN
   IF origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.work_order_id IS DISTINCT FROM NEW.work_order_id THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
   SELECT revision INTO origin_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,origin_row.work_order_revision_id);
   SELECT revision INTO instructed_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id);
   IF origin_revision IS NULL OR instructed_revision<=origin_revision THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
