-- LATER-SAFETY-151: exclude rejected invoice allocations before caps and input hashing.
BEGIN;

CREATE OR REPLACE FUNCTION app.ef_inputs(t uuid,ag app.enterprise_agreement_version,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE cutoff timestamptz; qrows jsonb; inputs jsonb; p_agreement uuid:=ag.id;
 rawrows jsonb; capped jsonb:='[]'::jsonb; extra_ref text; cap_row jsonb; allocation_row jsonb;
 paid numeric[]; bill numeric[]; eligible numeric[]; share numeric[]; approved numeric;
BEGIN
 -- Calendar month in Europe/London; cumulative principal is everything recorded before the cut-off.
 cutoff:=((p_period||'-01 00:00:00')::timestamp+interval '1 month') AT TIME ZONE 'Europe/London';
 IF ag.effective_from>=cutoff THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;

 -- Qualifying: contractor site-originated extras (site user, or surfaced and confirmed) recorded before the cut-off,
 -- whose origin time selects this agreement version, that are not linked as a duplicate, on a synthetic contractor job,
 -- exported, and carrying payment-allocated extra principal on the allocation run current at the cut-off.
 -- Office, client-instructed and order-line amounts, duplicates, unexported and unpaid amounts never appear here.
 SELECT coalesce(jsonb_agg(jsonb_build_object('allocation_id',q.allocation_id,'run_id',q.run_id,'rule',q.rule,'n',q.n::text,'dd',q.dd::text,
  'export_line_id',q.export_line_id,'job_id',q.job_id,'extra_id',q.extra_id,'origin_kind',q.origin_kind,'approved',q.approved,'billed',q.billed,'credited',q.credited) ORDER BY q.allocation_id),'[]'::jsonb) INTO qrows FROM(
 SELECT al.id allocation_id, al.run_id, al.rule, al.matched_extra_numerator n, al.matched_extra_denominator dd,
  l.id export_line_id, l.job_id, o.variation_id extra_id, effective.kind origin_kind, l.approved_net_pence approved, invoice_line->'billedNet' billed, invoice_line->'creditedNet' credited
 FROM app.extra_origin o
 -- Canonical commercial identity and effective origin are distinct: use the earliest group member at this cutoff.
 JOIN LATERAL (
  SELECT src.kind,src.server_recorded_at FROM app.extra_origin src
  WHERE src.tenant_id=o.tenant_id AND src.job_id=o.job_id AND src.server_recorded_at<cutoff
   AND (src.variation_id=o.variation_id OR EXISTS(
    SELECT 1 FROM app.extra_duplicate_link k WHERE k.tenant_id=src.tenant_id AND k.job_id=src.job_id
     AND k.duplicate_id=src.variation_id AND k.canonical_id=o.variation_id AND k.kind='link' AND k.server_recorded_at<cutoff
     AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE u.tenant_id=k.tenant_id AND u.reverses_link_id=k.id AND u.kind='unlink' AND u.server_recorded_at<cutoff)))
  ORDER BY src.server_recorded_at,src.variation_id LIMIT 1
 ) effective ON true
 JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(o.tenant_id,o.job_id) AND ct.job_track='contractor' AND ct.environment='synthetic_demo'
 JOIN app.billing_export_line l ON(l.tenant_id,l.job_id,l.extra_id)=(o.tenant_id,o.job_id,o.variation_id)
 JOIN app.billing_export_batch b ON(b.tenant_id,b.id)=(l.tenant_id,l.batch_id) AND b.server_recorded_at<cutoff
 JOIN app.contractor_receipt_line_allocation al ON(al.tenant_id,al.line_job_id,al.export_line_id)=(l.tenant_id,l.job_id,l.id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.id)=(al.tenant_id,al.job_id,al.run_id) AND r.server_recorded_at<cutoff
 JOIN LATERAL jsonb_array_elements(r.projection->'lines') invoice_line ON invoice_line->>'lineId'=al.external_invoice_line_id
 WHERE o.tenant_id=t AND o.job_track='contractor' AND effective.kind IN('site_user','jobguard_surfaced_confirmed') AND o.server_recorded_at<cutoff
  AND (SELECT v.id FROM app.enterprise_agreement_version v WHERE v.tenant_id=t AND v.effective_from<=effective.server_recorded_at ORDER BY v.effective_from DESC LIMIT 1)=p_agreement
  AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=r.tenant_id AND nx.predecessor_id=r.id AND nx.server_recorded_at<cutoff)
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link k WHERE k.tenant_id=t AND k.duplicate_id=o.variation_id AND k.kind='link' AND k.server_recorded_at<cutoff
   AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE u.tenant_id=t AND u.reverses_link_id=k.id AND u.kind='unlink' AND u.server_recorded_at<cutoff))
  -- Only a validated, explicitly unrejected projection line may supply fee principal.
  -- JSON equality fails closed for missing, null or malformed rejection state.
  AND invoice_line->'rejected'='false'::jsonb
  AND al.matched_extra_numerator<>0) q;


 -- ENT-F3/F5/F6: Q_g=max(0,min(approved,invoiced-credited,net paid after reversals)).
 -- Receipt allocations retain their historical net ratios. Cap their exact cumulative sum per extra, not each
 -- receipt; distribute any cap proportionally over the signed source allocations so the drill-down sums to Q_g.
 rawrows:=qrows;
 FOR extra_ref IN SELECT DISTINCT x->>'extra_id' FROM jsonb_array_elements(rawrows) x ORDER BY 1 LOOP
  paid:=ARRAY[0::numeric,1::numeric];
  FOR allocation_row IN SELECT x FROM jsonb_array_elements(rawrows) x WHERE x->>'extra_id'=extra_ref LOOP
   paid:=app.cb_add(paid[1],paid[2],(allocation_row->>'n')::numeric,(allocation_row->>'dd')::numeric);
   cap_row:=allocation_row;
  END LOOP;
  IF paid[1]<=0 THEN CONTINUE; END IF;
  approved:=(cap_row->>'approved')::numeric;
  bill:=app.cb_add((cap_row->'billed'->>'numerator')::numeric,(cap_row->'billed'->>'denominator')::numeric,
   -(cap_row->'credited'->>'numerator')::numeric,(cap_row->'credited'->>'denominator')::numeric);
  eligible:=paid;
  IF eligible[1]>approved*eligible[2] THEN eligible:=ARRAY[approved,1::numeric]; END IF;
  IF eligible[1]*bill[2]>bill[1]*eligible[2] THEN eligible:=bill; END IF;
  IF eligible[1]<=0 THEN CONTINUE; END IF;
  FOR allocation_row IN SELECT x FROM jsonb_array_elements(rawrows) x WHERE x->>'extra_id'=extra_ref LOOP
   share:=app.cb_add(0,1,(allocation_row->>'n')::numeric*eligible[1]*paid[2],(allocation_row->>'dd')::numeric*eligible[2]*paid[1]);
   capped:=capped||jsonb_build_array((allocation_row-'approved'-'billed'-'credited')||jsonb_build_object('n',share[1]::text,'dd',share[2]::text));
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(x ORDER BY (x->>'allocation_id')::uuid),'[]'::jsonb) INTO qrows FROM jsonb_array_elements(capped) x;

 inputs:=jsonb_build_object('agreement',ag.id,'agreementHash',ag.content_hash,'period',p_period,
  'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'allocation_id',x->>'n',x->>'dd')),'[]'::jsonb) FROM jsonb_array_elements(qrows) x));
 RETURN jsonb_build_object('rows',qrows,'hash',app.final_lock_hash(inputs),'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
ALTER FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

COMMIT;
