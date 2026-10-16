BEGIN;
-- SERIOUS-B9: read the issued subset and its saved integer tax facts. Historical
-- unbound synthetic invoices reconstruct the existing candidate_m1_standard_v1
-- display-tax allocation from their immutable group tax (0132: absolute weights,
-- largest remainder, line-ID tie-break). This does not recalculate invoice tax.
CREATE FUNCTION app.recovery_allocation_invoice_lines(p_tenant uuid,p_job uuid,p_invoice uuid)
 RETURNS TABLE(id uuid,net_pence bigint,gross_pence bigint,existed_at timestamptz)
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,app AS $$
DECLARE inv app.customer_invoice;
BEGIN
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND customer_invoice.id=p_invoice;
 IF inv.id IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=p_invoice) THEN
  RETURN QUERY SELECT l.id,b.net_pence,b.gross_pence,
   (SELECT min(r.created_at) FROM app.final_account_line earlier JOIN app.final_account_revision r
    ON(r.tenant_id,r.job_id,r.id)=(earlier.tenant_id,earlier.job_id,earlier.final_account_revision_id)
    WHERE earlier.tenant_id=l.tenant_id AND earlier.job_id=l.job_id AND earlier.line_kind=l.line_kind AND earlier.source_id=l.source_id)
  FROM app.final_account_invoiced_line b JOIN app.final_account_line l
   ON(l.tenant_id,l.job_id,l.id)=(b.tenant_id,b.job_id,b.final_account_line_id)
  WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=p_invoice AND b.net_pence>0;
 ELSE
  IF inv.net_pence<=0 THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN QUERY WITH weights AS (
   SELECT l.*,abs(l.net_pence::numeric) weight FROM app.final_account_line l
   WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=inv.final_account_revision_id
  ), parts AS (
   SELECT w.*,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(inv.tax_pence::numeric*weight/sum(weight) OVER()) END base,
    CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(inv.tax_pence::numeric*weight,sum(weight) OVER()) END remainder FROM weights w
  ), ranked AS (
   SELECT p.*,row_number() OVER(ORDER BY remainder DESC,p.id) rank,inv.tax_pence-sum(base) OVER() left_over FROM parts p
  ) SELECT l.id,l.net_pence,(l.net_pence+base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END)::bigint,
   (SELECT min(r.created_at) FROM app.final_account_line earlier JOIN app.final_account_revision r
    ON(r.tenant_id,r.job_id,r.id)=(earlier.tenant_id,earlier.job_id,earlier.final_account_revision_id)
    WHERE earlier.tenant_id=l.tenant_id AND earlier.job_id=l.job_id AND earlier.line_kind=l.line_kind AND earlier.source_id=l.source_id)
  FROM ranked l WHERE l.net_pence>0;
 END IF;
END $$;
ALTER FUNCTION app.recovery_allocation_invoice_lines(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_allocation_invoice_lines(uuid,uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.recovery_allocation_invoice_lines(uuid,uuid,uuid) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.write_recovery_allocation(p_tenant uuid,p_job uuid,p_session text,p_command jsonb,p_artifact jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record; c app.recovery_case_current; m record; inv app.customer_invoice; ev app.evidence_object;
 eligibility app.recovery_eligibility_revision; original app.recovery_case_allocation; review app.recovery_allocation_review;
 command_row app.recovery_allocation_command; cid uuid; pid uuid; aid uuid; rid uuid; did uuid; resolution_id uuid; auth_id uuid;
 action text:=p_command->>'action'; amount bigint:=(p_command->>'grossPence')::bigint;
 net bigint:=(p_artifact->>'eligibleNetPence')::bigint; tax bigint:=(p_artifact->>'taxPence')::bigint;
 recorded_remittance uuid; recorded_count integer; available bigint; source_id uuid; source_kind text; line jsonb; binding jsonb; source_binding uuid;
 lf record; prior_line app.receipt_line_allocation; remittance jsonb; remittance_ev app.evidence_object; share jsonb;
 hash text; result jsonb; used_pair numeric[]; balance_pair numeric[]; total_pair numeric[]:=ARRAY[0::numeric,1::numeric]; given_pair numeric[]:=ARRAY[0::numeric,1::numeric]; balances jsonb:='{}'; 
 gn numeric; gd numeric; nn numeric; nd numeric; direction integer; source_bytes bytea; keyword bytea:=decode('6a6f6267756172642d72656d697474616e636500','hex');
 png_prefix bytea:=decode('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63686868f80f00058402808ccd6626','hex'); content_bytes bytea; content_offset integer;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM (CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END)
 OR current_setting('app.recovery_allocation_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR p_command->>'version' IS DISTINCT FROM 'recovery-allocation-command.v1' OR p_artifact->>'version' IS DISTINCT FROM 'recovery-allocation-artifact.v1'
 OR action NOT IN('review','allocate','review_reverse','reverse') OR amount IS NULL OR amount<=0 OR amount>1000000000000 THEN
  RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Reversal lookup touches only our own allocation; the canonical case key precedes ALL job/case access.
 IF action IN('review_reverse','reverse') THEN
  SELECT * INTO original FROM app.recovery_case_allocation WHERE tenant_id=p_tenant AND job_id=p_job AND id=(p_command->>'allocationId')::uuid;
  IF original.id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23514'; END IF;
  cid:=original.case_id; pid:=original.payment_id;
 ELSE cid:=(p_command->>'caseId')::uuid;pid:=(p_command->>'paymentId')::uuid; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext(cid::text));
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,p_tenant);
 IF actor.membership_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=actor.membership_id AND identity_user_id=actor.identity_user_id
 AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO command_row FROM app.recovery_allocation_command WHERE tenant_id=p_tenant AND command_id=(p_command->>'commandId')::uuid;
 IF command_row.command_id IS NOT NULL THEN
  IF command_row.job_id<>p_job OR command_row.payload<>p_command OR command_row.actor_membership_id<>actor.membership_id THEN
   RAISE EXCEPTION 'ALLOCATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN command_row.result||jsonb_build_object('replayed',true);
 END IF;
 -- Keep the merged public caller shape: the case key precedes parent FK KEY SHARE locks.
 -- No explicit parent row lock is needed; same-case v1 callers cannot pass that key.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||pid::text,0));
 PERFORM app.lock_recovery_message_sources(p_tenant);
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=cid;
 IF c.id IS NULL OR c.state='prevented' OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.revision<>(p_command->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT p.invoice_id,e.id movement_id,e.source_hash,e.account_id,e.event_id,e.created_at,match_row.matched_pence INTO m
 FROM app.customer_payment p JOIN app.practice_feed_receipt_match match_row ON(match_row.tenant_id,match_row.job_id,match_row.payment_id)=(p.tenant_id,p.job_id,p.id)
 JOIN app.practice_feed_event e ON(e.tenant_id,e.account_id,e.event_id)=(match_row.tenant_id,match_row.account_id,match_row.settled_event_id)
 WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.id=pid AND e.job_id=p_job AND e.state='settled' AND e.identity='identified'
 AND e.gross_pence=match_row.matched_pence AND p.amount_pence=match_row.matched_pence
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.state='possible_duplicate'
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command rc WHERE rc.tenant_id=u.tenant_id AND rc.account_id=u.account_id AND rc.movement_key=u.movement_key AND rc.action='reconcile_duplicate'));
 IF m.movement_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a JOIN app.practice_feed_event e ON(e.tenant_id,e.id)=(a.tenant_id,a.movement_id) WHERE a.tenant_id=p_tenant AND a.invoice_id=m.invoice_id AND e.created_at>m.created_at) THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=m.invoice_id;
 SELECT * INTO eligibility FROM app.recovery_eligibility_revision WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid ORDER BY revision DESC LIMIT 1;
 SELECT e.* INTO ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=CASE WHEN original.id IS NULL THEN (p_command->>'evidenceId')::uuid ELSE original.evidence_id END AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified';
 IF ev.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=p_tenant AND x.evidence_id=ev.id) AND original.id IS NULL THEN
  RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL AND(eligibility.id IS NULL OR eligibility.status<>'approved' OR eligibility.classification<>'eligible_for_review') THEN RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 IF p_artifact->>'caseId' IS DISTINCT FROM cid::text OR p_artifact->>'paymentId' IS DISTINCT FROM pid::text
 OR p_artifact->>'invoiceId' IS DISTINCT FROM inv.id::text OR p_artifact->>'movementId' IS DISTINCT FROM m.movement_id::text
 OR p_artifact->>'movementHash' IS DISTINCT FROM trim(m.source_hash) OR p_artifact->>'evidenceId' IS DISTINCT FROM ev.id::text
 OR p_artifact->>'evidenceHash' IS DISTINCT FROM trim(ev.sha256) OR p_artifact->>'objectVersionId' IS DISTINCT FROM ev.object_version_id
 OR(p_artifact->>'expectedCaseRevision')::integer IS DISTINCT FROM c.revision
 OR(p_artifact->>'grossPence')::bigint IS DISTINCT FROM amount OR net IS NULL OR net<=0 OR tax IS NULL OR tax<0 OR amount<>net+tax
 OR amount::numeric*inv.net_pence<>net::numeric*inv.total_pence
 OR (original.id IS NULL AND p_artifact->>'eligibilityId' IS DISTINCT FROM eligibility.id::text)
 OR p_artifact->>'policyVersion' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN eligibility.policy_version ELSE original.policy_version END) THEN
  RAISE EXCEPTION 'INVALID_CASE_SPLIT' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL THEN
  IF NOT(c.source_refs ? inv.id::text) THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=pid) THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  SELECT m.matched_pence-coalesce(sum(a.gross_pence-(SELECT coalesce(sum(r.gross_pence),0) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=a.tenant_id AND r.allocation_id=a.id)),0)
  INTO available FROM app.recovery_case_allocation a WHERE a.tenant_id=p_tenant AND a.payment_id=pid;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF net>c.claim_pence-c.landed-c.written_off THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_CLAIM' USING ERRCODE='23514'; END IF;
  IF net>eligibility.eligible_net_pence-c.landed THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_EVIDENCE' USING ERRCODE='23514'; END IF;
  direction:=1;
 ELSE
  SELECT original.gross_pence-coalesce(sum(gross_pence),0) INTO available FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND allocation_id=original.id;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF p_command ? 'creditNoteId' THEN
   SELECT id INTO source_id FROM app.customer_credit_note WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND id=(p_command->>'creditNoteId')::uuid
   AND amount_pence>=(SELECT coalesce(sum(gross_pence),0)+amount FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND credit_note_id=(p_command->>'creditNoteId')::uuid);
   source_kind:='credit_note';
  ELSE SELECT id INTO source_id FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND job_id=p_job AND payment_id=pid;source_kind:='payment_reversal'; END IF;
  IF source_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_REVERSAL_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  direction:=-1;
 END IF;
 IF p_artifact->>'action' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END)
 OR p_artifact->>'allocationId' IS DISTINCT FROM original.id::text OR p_artifact->>'sourceId' IS DISTINCT FROM source_id::text
 OR p_artifact->>'sourceKind' IS DISTINCT FROM source_kind THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 -- Validate complete composition and immutable line bindings; arithmetic below checks kernel output by cross products.
 IF jsonb_typeof(p_artifact->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(p_artifact->'bindings') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_artifact->'bindings')<>(SELECT count(*) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id))
 OR jsonb_array_length(p_artifact->'bindings')>10000 OR jsonb_array_length(p_artifact->'lines')>jsonb_array_length(p_artifact->'bindings') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id) WHERE id=(binding->>'lineId')::uuid;
  IF lf.id IS NULL OR (binding->>'netPence')::bigint IS DISTINCT FROM lf.net_pence
  OR (binding->>'grossPence')::bigint IS DISTINCT FROM lf.gross_pence
  OR (binding->>'existedAt')::timestamptz IS DISTINCT FROM lf.existed_at THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,rule,source_ref)
  VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.id,lf.net_pence,(binding->>'grossPence')::bigint,lf.existed_at,'pro_rata',m.movement_id::text) ON CONFLICT DO NOTHING;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'bindings'))<>jsonb_array_length(p_artifact->'bindings')
 OR (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'lines'))<>jsonb_array_length(p_artifact->'lines') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF p_command ? 'remittanceEvidenceId' AND p_artifact->>'remittanceEvidenceId' IS DISTINCT FROM p_command->>'remittanceEvidenceId' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL THEN
  SELECT count(DISTINCT artifact->>'remittanceEvidenceId'),min(artifact->>'remittanceEvidenceId')::uuid INTO recorded_count,recorded_remittance
  FROM app.recovery_allocation_review WHERE tenant_id=p_tenant AND job_id=p_job AND payment_id=pid
  AND allocation_id IS NULL AND artifact->>'remittanceEvidenceId' IS NOT NULL;
  IF recorded_count>1 OR recorded_remittance IS NOT NULL AND
   (p_artifact->>'remittanceEvidenceId' IS DISTINCT FROM recorded_remittance::text OR p_artifact->>'remittanceContent' IS NULL)
  THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 -- Reliable explicit shares are verified against the finalized original's SHA-256, never trusted as an artifact flag.
 IF p_artifact->>'remittanceContent' IS NOT NULL THEN
  SELECT e.* INTO remittance_ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=(p_artifact->>'remittanceEvidenceId')::uuid AND e.kind='original' AND u.state='verified';
  IF remittance_ev.id IS NULL OR trim(remittance_ev.sha256)<>encode(sha256(decode(p_artifact->>'remittanceBytes','base64')),'hex')
  OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=p_tenant AND evidence_id=remittance_ev.id) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  source_bytes:=decode(p_artifact->>'remittanceBytes','base64');content_bytes:=convert_to(p_artifact->>'remittanceContent','UTF8');
  content_offset:=octet_length(png_prefix)+8+octet_length(keyword)+1;
  IF source_bytes IS NULL OR octet_length(source_bytes)>100000 OR substring(source_bytes FROM 1 FOR octet_length(png_prefix))<>png_prefix
  OR substring(source_bytes FROM octet_length(png_prefix)+5 FOR 4)<>decode('74455874','hex')
  OR substring(source_bytes FROM octet_length(png_prefix)+9 FOR octet_length(keyword))<>keyword
  OR substring(source_bytes FROM content_offset FOR octet_length(content_bytes))<>content_bytes
  OR octet_length(source_bytes)<>octet_length(png_prefix)+8+octet_length(keyword)+octet_length(content_bytes)+4+12
  OR substring(source_bytes FROM octet_length(source_bytes)-11)<>decode('0000000049454e44ae426082','hex') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF p_command ? 'remittanceEvidenceId' AND p_command->>'remittanceEvidenceId' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF NOT(p_command ? 'remittanceEvidenceId') AND original.id IS NULL AND recorded_remittance IS NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  remittance:=(p_artifact->>'remittanceContent')::jsonb;
  IF remittance->>'version' IS DISTINCT FROM 'recovery-remittance.v1' OR remittance->>'paymentId' IS DISTINCT FROM pid::text OR remittance->>'invoiceId' IS DISTINCT FROM inv.id::text
  OR jsonb_typeof(remittance->'shares') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END IF;
 -- Validate every balance as a fraction, including eligible lines omitted from an explicit result.
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(binding->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.gross_numerator,a.gross_denominator)),'[]')) INTO used_pair
  FROM app.receipt_line_allocation a
  JOIN app.recovery_case_allocation ca ON(ca.tenant_id,ca.id)=(a.tenant_id,a.allocation_id)
  JOIN app.practice_feed_event settled ON(settled.tenant_id,settled.id)=(ca.tenant_id,ca.movement_id)
  LEFT JOIN app.recovery_case_allocation_reversal reversal ON(reversal.tenant_id,reversal.id)=(a.tenant_id,a.reversal_id)
  LEFT JOIN app.customer_credit_note credit ON(credit.tenant_id,credit.id)=(reversal.tenant_id,reversal.credit_note_id)
  LEFT JOIN app.customer_payment_reversal refund ON(refund.tenant_id,refund.id)=(reversal.tenant_id,reversal.payment_reversal_id)
  WHERE a.tenant_id=p_tenant AND a.invoice_id=inv.id AND a.line_id=lf.line_id
  AND ((direction=-1 AND a.allocation_id=original.id) OR
   (direction=1 AND settled.created_at<=m.created_at AND (a.reversal_id IS NULL OR coalesce(credit.created_at,refund.created_at)<=m.created_at)));
  balance_pair:=CASE WHEN direction=1 THEN ARRAY[lf.gross_pence*used_pair[2]-used_pair[1],used_pair[2]] ELSE used_pair END;
  IF m.created_at<lf.existed_at THEN balance_pair:=ARRAY[0::numeric,1::numeric]; END IF;
  IF balance_pair[1]<0 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  balances:=balances||jsonb_build_object(lf.line_id::text,jsonb_build_array(balance_pair[1]::text,balance_pair[2]::text));
  total_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(total_pair),to_jsonb(balance_pair)));
 END LOOP;
 IF (SELECT sum(net_pence) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id)) IS DISTINCT FROM inv.net_pence
 OR (SELECT sum(gross_pence) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id)) IS DISTINCT FROM inv.total_pence THEN
  RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NOT NULL THEN
  IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(remittance->'shares'))<>jsonb_array_length(remittance->'shares') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  FOR share IN SELECT value FROM jsonb_array_elements(remittance->'shares') LOOP
   IF NOT(balances ? (share->>'lineId')) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 -- Separate-invoice priority requires the immutable supplementary binding; never infer it from line count.
 FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  IF lf.id IS NULL OR NOT(balances ? lf.line_id::text) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  gn:=(line->'gross'->>'numerator')::numeric;gd:=(line->'gross'->>'denominator')::numeric;
  nn:=(line->'net'->>'numerator')::numeric;nd:=(line->'net'->>'denominator')::numeric;
  IF gn IS NULL OR gd IS NULL OR nn IS NULL OR nd IS NULL OR gn<>trunc(gn) OR gd<>trunc(gd) OR nn<>trunc(nn) OR nd<>trunc(nd)
  OR gd<=0 OR nd<=0 OR gn*direction<0 OR nn*direction<0 OR nn*gd*lf.gross_pence<>gn*nd*lf.net_pence
  OR gcd(abs(gn),gd)<>1 OR gcd(abs(nn),nd)<>1 THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  balance_pair:=ARRAY[(balances->lf.line_id::text->>0)::numeric,(balances->lf.line_id::text->>1)::numeric];
  IF abs(gn)*balance_pair[2]>balance_pair[1]*gd THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF direction=-1 THEN
   SELECT * INTO prior_line FROM app.receipt_line_allocation WHERE tenant_id=p_tenant AND allocation_id=original.id AND line_id=lf.line_id AND reversal_id IS NULL;
   IF prior_line.id IS NULL OR line->>'reversesId' IS DISTINCT FROM prior_line.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  ELSIF line->>'reversesId' IS NOT NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  given_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(given_pair),jsonb_build_array(abs(gn)::text,gd::text)));
  IF remittance IS NOT NULL THEN
   SELECT value INTO share FROM jsonb_array_elements(remittance->'shares') WHERE value->>'lineId'=lf.line_id::text;
   IF line->>'rule' IS DISTINCT FROM 'explicit' OR line->>'sourceRef' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF (direction=1 OR p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric<>coalesce(share->'gross'->>'numerator','0')::numeric*gd THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF direction=-1 AND NOT(p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric*original.gross_pence<>coalesce(share->'gross'->>'numerator','0')::numeric*gd*amount THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   -- Record the reliable source alongside the immutable bound invoice line.
   IF NOT EXISTS(SELECT 1 FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=lf.line_id AND evidence_id=remittance_ev.id) THEN
    INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,evidence_id,evidence_object_version_id,evidence_hash,evidence_server_received_at,gross_numerator,gross_denominator,rule,source_ref)
    VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.line_id,lf.net_pence,lf.gross_pence,lf.existed_at,remittance_ev.id,remittance_ev.object_version_id,remittance_ev.sha256,remittance_ev.server_received_at,coalesce(share->'gross'->>'numerator','0'),coalesce(share->'gross'->>'denominator','1'),'explicit',remittance_ev.id::text);
   END IF;
  ELSIF line->>'rule' IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM app.final_account_invoice_binding b
   WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=inv.id AND b.invoice_kind='supplementary') THEN 'separate_invoice' ELSE 'pro_rata' END)
  OR line->>'sourceRef' IS DISTINCT FROM (CASE WHEN original.id IS NOT NULL THEN source_id::text
   WHEN EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=inv.id AND b.invoice_kind='supplementary') THEN inv.id::text ELSE m.movement_id::text END) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF given_pair[1]<>amount*given_pair[2] OR total_pair[1]<amount*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NULL THEN
  -- Check all lines, including omitted zero candidates: a positive proportional share cannot disappear.
  FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
   SELECT value INTO line FROM jsonb_array_elements(p_artifact->'lines') WHERE value->>'lineId'=binding->>'lineId';
   gn:=coalesce((line->'gross'->>'numerator')::numeric,0);gd:=coalesce((line->'gross'->>'denominator')::numeric,1);
   balance_pair:=ARRAY[(balances->(binding->>'lineId')->>0)::numeric,(balances->(binding->>'lineId')->>1)::numeric];
   IF abs(gn)*total_pair[1]*balance_pair[2]<>amount::numeric*balance_pair[1]*gd*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 hash:=encode(sha256(convert_to(p_artifact::text,'UTF8')),'hex');
 IF action IN('review','review_reverse') THEN
  did:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(did,p_tenant,'recovery_case',cid::text,'recovery_allocation.'||CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END);
  INSERT INTO app.recovery_allocation_review(id,tenant_id,job_id,case_id,payment_id,allocation_id,command_id,action,expected_case_revision,artifact,approval_hash,decision_id,reviewer_ref)
  VALUES(rid,p_tenant,p_job,cid,pid,original.id,(p_command->>'commandId')::uuid,CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,c.revision,p_artifact,hash,did,'membership:'||actor.membership_id);
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',NULL,'review',jsonb_build_object('action',CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,'caseId',cid,'paymentId',pid,'allocationId',original.id,'expectedCaseRevision',c.revision,'grossPence',amount,'eligibleNetPence',net,'taxPence',tax,'approvalHash',hash,'policyVersion',p_artifact->>'policyVersion','movementHash',m.source_hash,'evidenceHash',ev.sha256));
 ELSE
  SELECT * INTO review FROM app.recovery_allocation_review WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid AND approval_hash=p_command->>'approvalHash' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF review.id IS NULL OR review.artifact<>p_artifact OR review.expected_case_revision<>c.revision OR review.expires_at<=clock_timestamp()
  OR review.action<>action OR review.reviewer_ref<>'membership:'||actor.membership_id
  OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=p_tenant AND decision_id=review.decision_id) THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  resolution_id:=gen_random_uuid();auth_id:=gen_random_uuid();aid:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,review.decision_id,'approved',actor.membership_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
  VALUES(auth_id,p_tenant,review.decision_id,resolution_id,actor.membership_id,'recovery_allocation.'||action,cid::text,hash,c.revision,amount,'GBP',p_artifact->>'policyVersion',review.expires_at);
  IF original.id IS NULL THEN
   INSERT INTO app.recovery_case_allocation(id,tenant_id,job_id,case_id,payment_id,invoice_id,command_id,review_id,authorization_id,gross_pence,eligible_net_pence,tax_pence,evidence_id,object_version_id,evidence_hash,evidence_server_received_at,policy_version,reviewer_ref,movement_id,movement_hash,account_id,settled_event_id)
   VALUES(aid,p_tenant,p_job,cid,pid,inv.id,(p_command->>'commandId')::uuid,review.id,auth_id,amount,net,tax,ev.id,ev.object_version_id,ev.sha256,ev.server_received_at,eligibility.policy_version,'membership:'||actor.membership_id,m.movement_id,m.source_hash,m.account_id,m.event_id);
  ELSE
   aid:=original.id;
   INSERT INTO app.recovery_case_allocation_reversal(id,tenant_id,job_id,allocation_id,command_id,review_id,authorization_id,source_kind,source_id,payment_reversal_id,credit_note_id,gross_pence,eligible_net_pence,tax_pence)
   VALUES(rid,p_tenant,p_job,aid,(p_command->>'commandId')::uuid,review.id,auth_id,source_kind,source_id,CASE WHEN source_kind='payment_reversal' THEN source_id END,CASE WHEN source_kind='credit_note' THEN source_id END,amount,net,tax);
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
   SELECT id INTO source_binding FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NOT DISTINCT FROM CASE WHEN remittance IS NOT NULL THEN remittance_ev.id END AND credit_note_id IS NULL ORDER BY id LIMIT 1;
   INSERT INTO app.receipt_line_allocation(id,tenant_id,job_id,payment_id,invoice_id,line_id,allocation_id,reversal_id,reverses_id,source_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator)
   VALUES(gen_random_uuid(),p_tenant,p_job,pid,inv.id,(line->>'lineId')::uuid,aid,CASE WHEN original.id IS NOT NULL THEN rid END,CASE WHEN original.id IS NOT NULL THEN (line->>'reversesId')::uuid END,source_binding,line->>'rule',line->>'sourceRef',line->'gross'->>'numerator',line->'gross'->>'denominator',line->'net'->>'numerator',line->'net'->>'denominator');
  END LOOP;
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',aid,'review',NULL);
 END IF;
 result:=result||jsonb_build_object('payloadHash',encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),'approvalHash',hash);
 INSERT INTO app.recovery_allocation_command(command_id,tenant_id,job_id,case_id,actor_membership_id,payload,payload_hash,artifact,result)
 VALUES((p_command->>'commandId')::uuid,p_tenant,p_job,cid,actor.membership_id,p_command,encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),p_artifact,result);
 RETURN result;
END $$;
ALTER FUNCTION app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb) TO jobguard_runtime;


COMMIT;
