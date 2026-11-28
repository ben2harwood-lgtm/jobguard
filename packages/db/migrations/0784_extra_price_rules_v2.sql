-- EP-CC-S1 (Enterprise R1, workstream F3/F2): pricing contract v2 (docs/contracts/extra-price-rules-v2.md). Synthetic practice only; Gate G1 stays closed.
-- Every new price and every new revision carries a recorded basis, written in the same transaction as its revision binding:
--   * server_sor: the surveyor names a rate code and the TOTAL claimed quantity. The rate comes from the rate-list version of the job's current work-order
--     revision and the tendered adjustment from that same revision (the contract's terms as imported), exactly as first-revision pricing (0140) does. A code
--     that is on the order prices only the excess over the instructed quantity; a claim at or below it is ALREADY_ON_ORDER. The pence come only from
--     app.sor_line_net_pence (exact, half-even, 1..1e12).
--   * surveyor_quoted: a net amount, a method, a basis note (1..500 characters) and optionally one verified evidence item of the same job.
--   * a revision also records its reason, an optional note and the request it answers (the latest, decided request).
-- Storage, forward-only: app.extra_pricing_basis gains nullable v2 columns (existing rows keep NULL in every one; nothing is back-filled) and its guard accepts
-- v2 rows under PriceExtra/ReviseExtra receipts for any binding revision. app.extra_sor_revision is NOT widened: it stays the origin-bound first revision of a
-- LogSiteExtra capture (its one-row-per-extra rule is read by billing, evidence packs and the order check), so a later rate-code price is an ordinary binding
-- whose rate-code detail lives on its v2 basis row. A new deferred constraint trigger refuses any ordinary binding that commits without its v2 basis row, so the
-- unchanged v1 writer app.xa_price can no longer create a price (BASIS_REQUIRED); completed v1 receipts still replay through the command lifecycle.
-- Grants: the runtime keeps SELECT only on extra_pricing_basis; the one new writer app.xa_price_v2 is a SECURITY DEFINER owned by jobguard_migration with the
-- LP-6d binding prefix, executable by jobguard_runtime only.
BEGIN;

-- 1. The v2 basis columns. All NULL on every existing row (legacy server_sor revision-1 rows and nothing else exist).
ALTER TABLE app.extra_pricing_basis
 ADD COLUMN basis_version text CHECK(basis_version IS NULL OR basis_version='extra-pricing-basis.v2'),
 ADD COLUMN binding_id uuid,
 ADD COLUMN command_version text CHECK(command_version IS NULL OR command_version IN('price-extra.v2','revise-extra.v2')),
 ADD COLUMN net_pence bigint CHECK(net_pence IS NULL OR net_pence BETWEEN 1 AND 1000000000000),
 ADD COLUMN work_order_id uuid,
 ADD COLUMN work_order_revision_id uuid,
 ADD COLUMN sor_version_id uuid,
 ADD COLUMN sor_code text CHECK(sor_code IS NULL OR length(sor_code) BETWEEN 1 AND 80),
 ADD COLUMN unit text,
 ADD COLUMN rate_pence bigint,
 ADD COLUMN adjustment_numerator bigint,
 ADD COLUMN adjustment_denominator bigint CHECK(adjustment_denominator IS NULL OR adjustment_denominator>0),
 ADD COLUMN coverage text CHECK(coverage IS NULL OR coverage IN('new','excess')),
 ADD COLUMN instructed_quantity text CHECK(instructed_quantity IS NULL OR instructed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 ADD COLUMN claimed_quantity text CHECK(claimed_quantity IS NULL OR claimed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 ADD COLUMN priced_quantity text CHECK(priced_quantity IS NULL OR priced_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 ADD COLUMN quote_method text CHECK(quote_method IS NULL OR quote_method IN('dayworks','quotation','agreed_lump_sum','materials_plus')),
 ADD COLUMN basis_note text CHECK(basis_note IS NULL OR char_length(basis_note) BETWEEN 1 AND 500),
 ADD COLUMN basis_evidence_id uuid,
 ADD COLUMN revision_reason text CHECK(revision_reason IS NULL OR revision_reason IN('response_to_rejection','quantity_corrected','rate_corrected','pricing_error')),
 ADD COLUMN revision_note text CHECK(revision_note IS NULL OR char_length(revision_note) BETWEEN 1 AND 500),
 ADD COLUMN answers_request_id uuid,
 ADD COLUMN basis_hash char(64) CHECK(basis_hash IS NULL OR basis_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.extra_pricing_basis
 -- A legacy (0140) row carries none of the v2 columns; a v2 row is a complete price or revision record.
 ADD CONSTRAINT extra_pricing_basis_v2_shape CHECK(
  (basis_version IS NULL AND binding_id IS NULL AND command_version IS NULL AND net_pence IS NULL AND work_order_id IS NULL AND work_order_revision_id IS NULL
   AND sor_version_id IS NULL AND sor_code IS NULL AND unit IS NULL AND rate_pence IS NULL AND adjustment_numerator IS NULL AND adjustment_denominator IS NULL
   AND coverage IS NULL AND instructed_quantity IS NULL AND claimed_quantity IS NULL AND priced_quantity IS NULL AND quote_method IS NULL AND basis_note IS NULL
   AND basis_evidence_id IS NULL AND revision_reason IS NULL AND revision_note IS NULL AND answers_request_id IS NULL AND basis_hash IS NULL)
  OR (basis_version IS NOT NULL AND binding_id IS NOT NULL AND command_version IS NOT NULL AND net_pence IS NOT NULL AND basis_hash IS NOT NULL
   AND ((pricing_basis='server_sor' AND work_order_id IS NOT NULL AND work_order_revision_id IS NOT NULL AND sor_version_id IS NOT NULL AND sor_code IS NOT NULL
     AND unit IS NOT NULL AND rate_pence IS NOT NULL AND adjustment_numerator IS NOT NULL AND adjustment_denominator IS NOT NULL AND coverage IS NOT NULL
     AND claimed_quantity IS NOT NULL AND priced_quantity IS NOT NULL AND (coverage='excess')=(instructed_quantity IS NOT NULL)
     AND quote_method IS NULL AND basis_note IS NULL AND basis_evidence_id IS NULL)
    OR (pricing_basis='surveyor_quoted' AND quote_method IS NOT NULL AND basis_note IS NOT NULL
     AND work_order_id IS NULL AND work_order_revision_id IS NULL AND sor_version_id IS NULL AND sor_code IS NULL AND unit IS NULL AND rate_pence IS NULL
     AND adjustment_numerator IS NULL AND adjustment_denominator IS NULL AND coverage IS NULL AND instructed_quantity IS NULL AND claimed_quantity IS NULL AND priced_quantity IS NULL))
   AND ((command_version='revise-extra.v2' AND revision_reason IS NOT NULL AND answers_request_id IS NOT NULL)
    OR (command_version='price-extra.v2' AND revision_reason IS NULL AND revision_note IS NULL AND answers_request_id IS NULL)))),
 ADD CONSTRAINT extra_pricing_basis_binding_fk FOREIGN KEY(tenant_id,job_id,variation_id,binding_id) REFERENCES app.extra_approval_revision_binding(tenant_id,job_id,variation_id,id),
 ADD CONSTRAINT extra_pricing_basis_order_fk FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 ADD CONSTRAINT extra_pricing_basis_order_revision_fk FOREIGN KEY(tenant_id,work_order_id,work_order_revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 -- The rate and unit are the persisted rate-list item's, never the caller's (the pattern of app.work_order_line and app.extra_sor_revision).
 ADD CONSTRAINT extra_pricing_basis_rate_fk FOREIGN KEY(tenant_id,sor_version_id,sor_code,unit,rate_pence) REFERENCES app.sor_item(tenant_id,version_id,code,unit,rate_pence),
 -- Basis evidence is structurally the same job's evidence object.
 ADD CONSTRAINT extra_pricing_basis_evidence_fk FOREIGN KEY(tenant_id,job_id,basis_evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 ADD CONSTRAINT extra_pricing_basis_answers_fk FOREIGN KEY(tenant_id,job_id,variation_id,answers_request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id);

-- 2. The basis guard. The legacy branch (basis_version NULL) is the 0140 body unchanged; the v2 branch binds the row to its own binding, revision, price,
-- rate, evidence and answered request inside the PriceExtra/ReviseExtra command that wrote them.
CREATE OR REPLACE FUNCTION app.ent3c_pricing_basis_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r app.extra_sor_revision; receipt app.command_receipt; b app.extra_approval_revision_binding; vr app.variation_revision; wor app.work_order_revision; latest app.extra_approval_request;
 outcome text; instructed numeric; v_lines integer; values_to_hash text[]; value_text text; encoded text:='extra-pricing-basis-hash.v2'||chr(10);
BEGIN
 IF NEW.basis_version IS NULL THEN
  IF NEW.pricing_basis IS DISTINCT FROM 'server_sor' OR NEW.revision IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT x.* INTO r FROM app.extra_sor_revision x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.variation_id=NEW.variation_id AND x.revision=NEW.revision;
  IF r.id IS NULL OR r.content_hash IS DISTINCT FROM NEW.revision_content_hash OR r.command_id IS DISTINCT FROM NEW.command_id OR r.raising_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
  SELECT x.* INTO receipt FROM app.command_receipt x WHERE x.tenant_id=NEW.tenant_id AND x.command_id=NEW.command_id;
  IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.command_type IS DISTINCT FROM 'LogSiteExtra'
   OR receipt.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
  NEW.server_recorded_at:=r.server_recorded_at;
  RETURN NEW;
 END IF;
 -- v2: only inside its own still-processing PriceExtra/ReviseExtra command, for the same actor.
 SELECT x.* INTO receipt FROM app.command_receipt x WHERE x.tenant_id=NEW.tenant_id AND x.command_id=NEW.command_id;
 IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id
  OR receipt.command_type IS DISTINCT FROM (CASE NEW.command_version WHEN 'price-extra.v2' THEN 'PriceExtra' WHEN 'revise-extra.v2' THEN 'ReviseExtra' END) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Beside exactly its own ordinary binding: same extra, logical revision, hash, command and actor; the binding's revision carries this net.
 SELECT x.* INTO b FROM app.extra_approval_revision_binding x WHERE(x.tenant_id,x.job_id,x.variation_id,x.id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.binding_id);
 IF b.id IS NULL OR b.source_kind IS DISTINCT FROM 'ordinary' OR b.logical_revision IS DISTINCT FROM NEW.revision OR b.source_hash IS DISTINCT FROM NEW.revision_content_hash
  OR b.command_id IS DISTINCT FROM NEW.command_id OR b.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT x.* INTO vr FROM app.variation_revision x WHERE(x.tenant_id,x.job_id,x.id)=(NEW.tenant_id,NEW.job_id,b.variation_revision_id);
 IF vr.id IS NULL OR vr.signed_delta_pence IS DISTINCT FROM NEW.net_pence OR vr.content_hash IS DISTINCT FROM NEW.revision_content_hash THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF NEW.pricing_basis='server_sor' THEN
  -- The job's own current, ordered work-order revision supplies the rate list and the tendered adjustment.
  SELECT x.* INTO wor FROM app.work_order_current c JOIN app.work_order_revision x ON(x.tenant_id,x.work_order_id,x.id)=(c.tenant_id,c.work_order_id,c.revision_id)
   WHERE c.tenant_id=NEW.tenant_id AND c.work_order_id=NEW.work_order_id;
  IF wor.id IS DISTINCT FROM NEW.work_order_revision_id OR wor.status IS DISTINCT FROM 'ordered' OR wor.sor_version_id IS DISTINCT FROM NEW.sor_version_id
   OR wor.adjustment_numerator IS DISTINCT FROM NEW.adjustment_numerator OR wor.adjustment_denominator IS DISTINCT FROM NEW.adjustment_denominator THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
  SELECT count(*),sum(l.quantity::numeric) INTO v_lines,instructed FROM app.work_order_line l WHERE l.tenant_id=NEW.tenant_id AND l.revision_id=wor.id AND l.sor_code=NEW.sor_code;
  IF (v_lines>0) IS DISTINCT FROM (NEW.coverage='excess')
   OR (NEW.coverage='excess' AND (NEW.instructed_quantity::numeric IS DISTINCT FROM instructed OR NEW.claimed_quantity::numeric-instructed IS DISTINCT FROM NEW.priced_quantity::numeric))
   OR (NEW.coverage='new' AND NEW.claimed_quantity::numeric IS DISTINCT FROM NEW.priced_quantity::numeric)
   OR NEW.priced_quantity::numeric<=0
   OR NEW.net_pence IS DISTINCT FROM app.sor_line_net_pence(NEW.priced_quantity,NEW.rate_pence,NEW.adjustment_numerator,NEW.adjustment_denominator) THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.pricing_basis='surveyor_quoted' THEN
  IF NEW.basis_evidence_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.basis_evidence_id AND e.kind='original'
    AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id) AND u.state='verified' AND u.object_version_id=e.object_version_id)
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))) THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
 ELSE
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 IF NEW.command_version='revise-extra.v2' THEN
  -- The answered request is the extra's latest request, and it is decided (a revision answers an outcome, never a pending request).
  SELECT q.* INTO latest FROM app.extra_approval_request q WHERE q.tenant_id=NEW.tenant_id AND q.variation_id=NEW.variation_id ORDER BY q.request_revision DESC LIMIT 1;
  SELECT o.kind INTO outcome FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(NEW.tenant_id,latest.id);
  IF latest.id IS DISTINCT FROM NEW.answers_request_id OR outcome IS NULL OR outcome NOT IN('approved','rejected')
   OR (NEW.revision_reason='response_to_rejection' AND outcome<>'rejected') THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.server_recorded_at:=clock_timestamp();
 values_to_hash:=ARRAY[NEW.tenant_id::text,NEW.id::text,NEW.job_id::text,NEW.variation_id::text,NEW.revision::text,NEW.binding_id::text,NEW.pricing_basis,NEW.command_version,
  NEW.revision_content_hash::text,NEW.net_pence::text,NEW.work_order_id::text,NEW.work_order_revision_id::text,NEW.sor_version_id::text,NEW.sor_code,NEW.unit,NEW.rate_pence::text,
  NEW.adjustment_numerator::text,NEW.adjustment_denominator::text,NEW.coverage,NEW.instructed_quantity,NEW.claimed_quantity,NEW.priced_quantity,NEW.quote_method,NEW.basis_note,
  NEW.basis_evidence_id::text,NEW.revision_reason,NEW.revision_note,NEW.answers_request_id::text,NEW.command_id::text,NEW.actor_membership_id::text];
 FOREACH value_text IN ARRAY values_to_hash LOOP
  encoded:=encoded||(CASE WHEN value_text IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(value_text,'UTF8'))::text||':'||value_text||';' END);
 END LOOP;
 NEW.basis_hash:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 RETURN NEW;
END $$;

-- 3. At commit: an ordinary binding (a surveyor's price or revision) never exists without exactly one v2 basis row beside it, for any writer.
CREATE FUNCTION app.xa_require_binding_basis() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source_kind='ordinary' AND (SELECT count(*) FROM app.extra_pricing_basis p WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND p.variation_id=NEW.variation_id
   AND p.binding_id=NEW.id AND p.revision=NEW.logical_revision AND p.basis_version='extra-pricing-basis.v2')<>1 THEN
  RAISE EXCEPTION 'BASIS_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER binding_requires_basis AFTER INSERT ON app.extra_approval_revision_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.xa_require_binding_basis();

-- 4. The one v2 writer: PriceExtra / ReviseExtra with a validated basis. State rules are xa_price's (0752) unchanged; only the price source, the basis row and
-- the revision reason are new. Refusal order: binding, receipt, pricing grant, extra existence, basis shape, revision reason, state, answered request, evidence, rate.
CREATE FUNCTION app.xa_price_v2(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_revise boolean, p_kind text, p_sor_code text, p_claimed_quantity text,
 p_net bigint, p_method text, p_note text, p_evidence uuid, p_reason text, p_reason_note text, p_answers_request uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_var app.variation; v_prev app.extra_approval_revision_binding; v_req app.extra_approval_request; v_outcome text; v_latest text;
 v_rev_id uuid:=pg_catalog.gen_random_uuid(); v_rev_no integer; v_prev_rev uuid; v_hash text; v_bid uuid:=pg_catalog.gen_random_uuid(); v_ref text; v_late boolean:=false; v_old_n integer;
 v_net bigint; v_wo app.work_order; v_wor app.work_order_revision; v_item app.sor_item; v_claimed numeric; v_instructed numeric; v_lines integer; v_priced text; v_cover text;
 v_basis_id uuid:=pg_catalog.gen_random_uuid(); v_basis_hash text; v_basis jsonb;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_revise THEN 'ReviseExtra' ELSE 'PriceExtra' END],p_actor);
 -- Ben, 13 Oct 2026 (answer 12): surveyors price. Revising a price is pricing.
 IF app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- The basis: exactly one of the two kinds, with exactly its own fields.
 IF p_kind IS NULL OR p_kind NOT IN('server_sor','surveyor_quoted') THEN RAISE EXCEPTION 'BASIS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF p_kind='server_sor' THEN
  IF p_sor_code IS NULL OR length(p_sor_code) NOT BETWEEN 1 AND 80 OR p_claimed_quantity IS NULL OR p_net IS NOT NULL OR p_method IS NOT NULL OR p_note IS NOT NULL OR p_evidence IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_BASIS' USING ERRCODE='23514';
  END IF;
  IF p_claimed_quantity !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
  v_claimed:=p_claimed_quantity::numeric;
  IF v_claimed=0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 ELSE
  IF p_sor_code IS NOT NULL OR p_claimed_quantity IS NOT NULL OR p_method IS NULL OR p_method NOT IN('dayworks','quotation','agreed_lump_sum','materials_plus')
   OR p_note IS NULL OR char_length(p_note) NOT BETWEEN 1 AND 500 OR btrim(p_note)='' THEN
   RAISE EXCEPTION 'INVALID_BASIS' USING ERRCODE='23514';
  END IF;
  IF p_net IS NULL OR p_net NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_revise THEN
  IF p_reason IS NULL OR p_reason NOT IN('response_to_rejection','quantity_corrected','rate_corrected','pricing_error') OR p_answers_request IS NULL THEN
   RAISE EXCEPTION 'REVISION_REASON_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF p_reason_note IS NOT NULL AND (char_length(p_reason_note) NOT BETWEEN 1 AND 500 OR btrim(p_reason_note)='') THEN RAISE EXCEPTION 'INVALID_BASIS' USING ERRCODE='23514'; END IF;
 ELSIF p_reason IS NOT NULL OR p_reason_note IS NOT NULL OR p_answers_request IS NOT NULL THEN
  RAISE EXCEPTION 'INVALID_BASIS' USING ERRCODE='23514';
 END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 SELECT b.* INTO v_prev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 IF NOT p_revise THEN
  -- Two legal starting points: never submitted (logged, no request), or submitted UNPRICED and not yet decided (the latest request has no net and no outcome). The second supersedes that request.
  v_late:=v_latest='awaiting_approval' AND v_req.id IS NOT NULL AND v_req.net_pence IS NULL AND v_req.binding_id IS NULL AND v_prev.id IS NULL
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
  IF NOT v_late AND (v_latest IS DISTINCT FROM 'logged' OR v_req.id IS NOT NULL OR v_prev.id IS NOT NULL) OR EXISTS(SELECT 1 FROM app.extra_sor_revision s WHERE(s.tenant_id,s.variation_id)=(v_tenant,p_variation)) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT o.kind INTO v_outcome FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id);
  IF v_req.id IS NULL OR v_outcome NOT IN('approved','rejected') OR v_latest NOT IN('approved','rejected') THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  -- The revision answers the request on screen; any other (older or unknown) request is stale.
  IF p_answers_request IS DISTINCT FROM v_req.id THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF p_reason='response_to_rejection' AND v_outcome<>'rejected' THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 -- Optional basis evidence: verified, current, original evidence of THIS job only.
 IF p_evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=v_tenant AND e.job_id=p_job AND e.id=p_evidence AND e.kind='original'
   AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id) AND u.state='verified' AND u.object_version_id=e.object_version_id)
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))) THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_FOUND' USING ERRCODE='23514';
 END IF;
 IF p_kind='server_sor' THEN
  -- The rate list and tendered adjustment of the job's current, ordered work-order revision (never the caller's).
  SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
  SELECT r.* INTO v_wor FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id)
   WHERE c.tenant_id=v_tenant AND c.work_order_id=v_wo.id;
  IF v_wo.id IS NULL OR v_wor.id IS NULL OR v_wor.status IS DISTINCT FROM 'ordered' OR v_wor.sor_version_id IS NULL THEN RAISE EXCEPTION 'RATE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  SELECT i.* INTO v_item FROM app.sor_item i WHERE i.tenant_id=v_tenant AND i.version_id=v_wor.sor_version_id AND i.code=p_sor_code;
  IF v_item.code IS NULL THEN RAISE EXCEPTION 'RATE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  -- The order check, from the current revision's own lines: a code on the order prices only the claim above everything instructed under that code.
  SELECT count(*),sum(l.quantity::numeric) INTO v_lines,v_instructed FROM app.work_order_line l WHERE l.tenant_id=v_tenant AND l.revision_id=v_wor.id AND l.sor_code=p_sor_code;
  IF v_lines>0 THEN
   IF v_claimed<=v_instructed THEN RAISE EXCEPTION 'ALREADY_ON_ORDER' USING ERRCODE='23514'; END IF;
   v_cover:='excess'; v_priced:=trim_scale(v_claimed-v_instructed)::text;
  ELSE
   v_cover:='new'; v_priced:=trim_scale(v_claimed)::text; v_instructed:=NULL;
  END IF;
  -- The one money figure: the merged exact half-even line price of the priced quantity alone (its MONEY_OUT_OF_RANGE passes through unchanged).
  v_net:=app.sor_line_net_pence(v_priced,v_item.rate_pence,v_wor.adjustment_numerator,v_wor.adjustment_denominator);
  IF v_net IS NULL OR v_net<1 THEN RAISE EXCEPTION 'EXTRA_NOT_POSITIVE' USING ERRCODE='23514'; END IF;
 ELSE
  v_net:=p_net;
 END IF;
 IF p_revise AND v_req.net_pence IS NOT DISTINCT FROM v_net THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 SELECT v.* INTO v_var FROM app.variation v WHERE(v.tenant_id,v.job_id,v.id)=(v_tenant,p_job,p_variation);
 SELECT r.revision,r.id INTO v_rev_no,v_prev_rev FROM app.variation_revision r WHERE(r.tenant_id,r.variation_id)=(v_tenant,p_variation) ORDER BY r.revision DESC LIMIT 1;
 v_rev_no:=coalesce(v_rev_no,0)+1;
 v_ref:='extra-price-v2:'||p_command::text;
 v_hash:=encode(sha256(convert_to(jsonb_build_array('extra-priced-revision.v2',v_tenant,v_rev_id,p_job,p_variation,v_rev_no,v_prev_rev,v_net,p_actor,p_command,p_kind,v_basis_id)::text,'UTF8')),'hex');
 INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
 VALUES(v_rev_id,v_tenant,p_job,p_variation,v_var.scope_item_id,v_rev_no,v_prev_rev,v_var.description,'1','item',v_net,v_net,v_hash,p_actor,'human_entered',v_ref,encode(sha256(convert_to(v_ref,'UTF8')),'hex'),'extra-price-rules.v2');
 INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,variation_revision_id,source_hash,predecessor_binding_id,command_id,actor_membership_id)
 VALUES(v_tenant,v_bid,p_job,p_variation,coalesce(v_prev.logical_revision,0)+1,'ordinary',v_rev_id,v_rev_id,v_hash,v_prev.id,p_command,p_actor);
 INSERT INTO app.extra_pricing_basis(tenant_id,id,job_id,variation_id,revision,pricing_basis,revision_content_hash,command_id,actor_membership_id,basis_version,binding_id,command_version,net_pence,
  work_order_id,work_order_revision_id,sor_version_id,sor_code,unit,rate_pence,adjustment_numerator,adjustment_denominator,coverage,instructed_quantity,claimed_quantity,priced_quantity,
  quote_method,basis_note,basis_evidence_id,revision_reason,revision_note,answers_request_id)
 VALUES(v_tenant,v_basis_id,p_job,p_variation,coalesce(v_prev.logical_revision,0)+1,p_kind,v_hash,p_command,p_actor,'extra-pricing-basis.v2',v_bid,CASE WHEN p_revise THEN 'revise-extra.v2' ELSE 'price-extra.v2' END,v_net,
  CASE WHEN p_kind='server_sor' THEN v_wo.id END,CASE WHEN p_kind='server_sor' THEN v_wor.id END,CASE WHEN p_kind='server_sor' THEN v_item.version_id END,CASE WHEN p_kind='server_sor' THEN v_item.code END,
  CASE WHEN p_kind='server_sor' THEN v_item.unit END,CASE WHEN p_kind='server_sor' THEN v_item.rate_pence END,CASE WHEN p_kind='server_sor' THEN v_wor.adjustment_numerator END,
  CASE WHEN p_kind='server_sor' THEN v_wor.adjustment_denominator END,v_cover,CASE WHEN v_cover='excess' THEN trim_scale(v_instructed)::text END,
  CASE WHEN p_kind='server_sor' THEN trim_scale(v_claimed)::text END,v_priced,
  CASE WHEN p_kind='surveyor_quoted' THEN p_method END,CASE WHEN p_kind='surveyor_quoted' THEN p_note END,p_evidence,
  CASE WHEN p_revise THEN p_reason END,CASE WHEN p_revise THEN p_reason_note END,CASE WHEN p_revise THEN p_answers_request END)
 RETURNING basis_hash INTO v_basis_hash;
 -- Server-built summary only (no free text): the stored basis is read back from the table.
 v_basis:=jsonb_build_object('basisId',v_basis_id,'basisHash',v_basis_hash,'pricingBasis',p_kind,'netPence',v_net)
  ||CASE WHEN p_kind='server_sor' THEN jsonb_build_object('sorCode',v_item.code,'unit',v_item.unit,'ratePence',v_item.rate_pence,'adjustment',jsonb_build_object('numerator',v_wor.adjustment_numerator::text,'denominator',v_wor.adjustment_denominator::text),
   'coverage',v_cover,'instructedQuantity',CASE WHEN v_cover='excess' THEN trim_scale(v_instructed)::text END,'claimedQuantity',trim_scale(v_claimed)::text,'pricedQuantity',v_priced) ELSE jsonb_build_object('method',p_method) END
  ||CASE WHEN p_revise THEN jsonb_build_object('reason',p_reason,'answersRequestId',p_answers_request) ELSE '{}'::jsonb END;
 IF p_revise THEN
  lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,v_net)||jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'basis',v_basis);
  PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 IF v_late THEN
  -- The unpriced snapshot is superseded by the new request revision (older revisions are refused as stale); its open Decision is dismissed.
  SELECT count(*) INTO v_old_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_old_n,'dismissed',p_actor);
  lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,v_net)||jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'supersededRequestId',v_req.id,'basis',v_basis);
  PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 lp5_result:=jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'revisionHash',v_hash,'netPence',v_net,'basis',v_basis);
 PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

ALTER FUNCTION app.ent3c_pricing_basis_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.xa_require_binding_basis() OWNER TO jobguard_migration;
ALTER FUNCTION app.xa_price_v2(uuid,uuid,uuid,uuid,boolean,text,text,text,bigint,text,text,uuid,text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3c_pricing_basis_guard(),app.xa_require_binding_basis() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.xa_price_v2(uuid,uuid,uuid,uuid,boolean,text,text,text,bigint,text,text,uuid,text,text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xa_price_v2(uuid,uuid,uuid,uuid,boolean,text,text,text,bigint,text,text,uuid,text,text,uuid) TO jobguard_runtime;
COMMIT;
