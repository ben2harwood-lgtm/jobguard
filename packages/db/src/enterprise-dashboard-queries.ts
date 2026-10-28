/** Single SELECT snapshot: current session, membership, dashboard grants, job AND operative scope precede aggregation.
 * Billing joins only matched exported lines after ENT-6's full-invoice allocation, at the same snapshot.
 * Output is an allowlist; no contact, free text, credential, provider or commercial command is selected.
 */
export const enterpriseDashboardSourceSql = `
WITH actor AS MATERIALIZED (
 SELECT s.* FROM app.contractor_session($1::uuid) s
 WHERE s.tenant_id=$2::uuid AND s.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND current_database()='jobguard_synthetic_demo' AND app.contractor_member_active(s.membership_id)
), grants AS MATERIALIZED (
 SELECT g.* FROM app.role_grant g JOIN actor a ON(a.tenant_id,a.membership_id)=(g.tenant_id,g.membership_id)
 WHERE app.contractor_role_permits(g.role,'dashboard.read')
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
), jobs AS MATERIALIZED (
 SELECT w.tenant_id,w.job_id,w.id work_order_id,w.client_id,w.contract_id,t.id team_id,b.id branch_id,b.parent_id region_id
 FROM app.work_order w JOIN actor a ON a.tenant_id=w.tenant_id
 JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id) AND j.provenance='work_order'
 JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(w.tenant_id,w.job_id) AND ct.job_track='contractor' AND ct.environment='synthetic_demo'
 JOIN app.team t ON t.tenant_id=w.tenant_id AND t.id=app.contractor_job_team(w.job_id)
 JOIN app.org_unit b ON(b.tenant_id,b.id)=(t.tenant_id,t.branch_id)
 WHERE app.contractor_job_allowed(a.membership_id,'dashboard.read',w.job_id)
), subject_teams AS MATERIALIZED (
 SELECT tm.tenant_id,tm.membership_id,t.id team_id,b.id branch_id,b.parent_id region_id
 FROM app.team_membership tm JOIN actor a ON a.tenant_id=tm.tenant_id
 JOIN app.team t ON(t.tenant_id,t.id)=(tm.tenant_id,tm.team_id)
 JOIN app.org_unit b ON(b.tenant_id,b.id)=(t.tenant_id,t.branch_id)
 WHERE tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))
), covered_subjects AS MATERIALIZED (
 SELECT DISTINCT j.tenant_id,j.job_id,st.membership_id FROM jobs j JOIN subject_teams st ON st.tenant_id=j.tenant_id
 WHERE EXISTS(SELECT 1 FROM grants g WHERE g.tenant_id=j.tenant_id
  AND (g.scope_kind='tenant' AND g.scope_id=g.tenant_id OR g.scope_kind='team' AND g.scope_id=j.team_id OR g.scope_kind='branch' AND g.scope_id=j.branch_id OR g.scope_kind='region' AND g.scope_id=j.region_id)
  AND NOT EXISTS(SELECT 1 FROM subject_teams other WHERE(other.tenant_id,other.membership_id)=(st.tenant_id,st.membership_id)
   AND NOT(g.scope_kind='tenant' AND g.scope_id=g.tenant_id OR g.scope_kind='team' AND g.scope_id=other.team_id OR g.scope_kind='branch' AND g.scope_id=other.branch_id OR g.scope_kind='region' AND g.scope_id=other.region_id)))
), scoped_extras AS MATERIALIZED (
 SELECT o.*,j.client_id,j.contract_id,j.team_id,j.region_id,v.sor_version_id,v.sor_code,v.excess_of_scope_item_id
 FROM app.extra_origin o JOIN jobs j ON(j.tenant_id,j.job_id)=(o.tenant_id,o.job_id)
 JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
 WHERE o.job_track='contractor' AND o.provenance='command'
  AND EXISTS(SELECT 1 FROM app.extra_event e WHERE(e.tenant_id,e.job_id,e.variation_id)=(o.tenant_id,o.job_id,o.variation_id) AND e.kind='logged')
  -- The SAME grant must cover the job and ALL current teams of an attributed operative.
  AND (o.raising_role<>'operative' OR EXISTS(SELECT 1 FROM covered_subjects cs WHERE(cs.tenant_id,cs.job_id,cs.membership_id)=(o.tenant_id,o.job_id,o.raising_membership_id)))
), active_links AS MATERIALIZED (
 SELECT l.* FROM app.extra_duplicate_link l JOIN jobs j ON(j.tenant_id,j.job_id)=(l.tenant_id,l.job_id)
 WHERE l.kind='link' AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))
), extras AS MATERIALIZED (
 SELECT o.*,coalesce(l.canonical_id,o.variation_id) canonical_id FROM scoped_extras o
 LEFT JOIN active_links l ON(l.tenant_id,l.job_id,l.duplicate_id)=(o.tenant_id,o.job_id,o.variation_id)
 WHERE l.canonical_id IS NULL OR EXISTS(SELECT 1 FROM scoped_extras c WHERE(c.tenant_id,c.job_id,c.variation_id)=(o.tenant_id,o.job_id,l.canonical_id))
), requests AS MATERIALIZED (
 SELECT q.* FROM app.extra_approval_request q JOIN extras e ON(e.tenant_id,e.job_id,e.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
 WHERE q.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE(x.tenant_id,x.variation_id)=(q.tenant_id,q.variation_id))
), extra_json AS (
 SELECT e.variation_id,jsonb_build_object('jobId',e.job_id,'extraId',e.variation_id,'canonicalExtraId',e.canonical_id,
  'dimensions',jsonb_build_object('region',e.region_id,'team',e.team_id,'operative',CASE WHEN e.raising_role='operative' THEN e.raising_membership_id END,'client',e.client_id,'contract',e.contract_id),
  'capturedAt',to_char(e.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'capturedSourceId',e.command_id,
  'capturedValueSourceId',price.id,'capturedValue',CASE WHEN price.net IS NOT NULL THEN jsonb_build_object('pence',price.net,'currency','GBP') END,
  'approved',CASE WHEN outcome.kind='approved' AND q.net_pence IS NOT NULL AND q.binding_id=binding.id THEN jsonb_build_object(
   'sourceId',outcome.id,'revisionId',binding.source_revision_id,'at',to_char(outcome.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'value',jsonb_build_object('pence',q.net_pence,'currency','GBP')) END,
  'steps',coalesce(steps.content,'[]'::jsonb)) content
 FROM extras e LEFT JOIN requests q ON(q.tenant_id,q.variation_id)=(e.tenant_id,e.variation_id)
 LEFT JOIN app.extra_approval_outcome outcome ON(outcome.tenant_id,outcome.request_id)=(q.tenant_id,q.id)
 LEFT JOIN LATERAL(SELECT b.* FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.variation_id)=(e.tenant_id,e.variation_id) ORDER BY b.logical_revision DESC LIMIT 1) binding ON true
 LEFT JOIN LATERAL(
  SELECT CASE WHEN binding.source_kind='ordinary' THEN v.id ELSE s.id END id,CASE WHEN binding.source_kind='ordinary' THEN v.signed_delta_pence ELSE s.net_pence END net
  FROM (SELECT 1) dummy LEFT JOIN app.extra_sor_revision s ON(s.tenant_id,s.variation_id)=(e.tenant_id,e.variation_id)
  LEFT JOIN app.variation_revision v ON(v.tenant_id,v.id)=(binding.tenant_id,binding.variation_revision_id)
 ) price ON true
 LEFT JOIN LATERAL(
  SELECT jsonb_agg(jsonb_build_object('id',coalesce(f.id,app.xa_decision_id(q.id,(step->>'index')::integer)),
   'sourceIds',jsonb_build_array(q.id)||CASE WHEN previous.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(previous.id) END,
   'dueAt',CASE WHEN step->>'timeLimitMinutes' IS NOT NULL THEN to_char((coalesce(previous.server_recorded_at,q.server_recorded_at)+((step->>'timeLimitMinutes')::integer*interval '1 minute')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
   'completedAt',to_char(f.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'outcome',CASE WHEN f.id IS NOT NULL THEN 'approved' WHEN outcome.kind IS NOT NULL THEN outcome.kind ELSE 'pending' END) ORDER BY (step->>'index')::integer) content
  FROM jsonb_array_elements(q.requirement->'steps') step
  LEFT JOIN app.extra_approval_step_fact f ON(f.tenant_id,f.request_id,f.step_index)=(q.tenant_id,q.id,(step->>'index')::integer)
  LEFT JOIN app.extra_approval_step_fact previous ON(previous.tenant_id,previous.request_id,previous.step_index)=(q.tenant_id,q.id,(step->>'index')::integer-1)
  WHERE f.id IS NOT NULL OR (outcome.id IS NULL AND (step->>'index')::integer=(SELECT count(*) FROM app.extra_approval_step_fact done WHERE(done.tenant_id,done.request_id)=(q.tenant_id,q.id)))
 ) steps ON true
), signal_extra AS (
 SELECT e.variation_id,jsonb_build_object('jobId',e.job_id,'extraId',e.variation_id,'sourceId',e.command_id,'sorVersionId',e.sor_version_id,'sorCode',e.sor_code,
  'linked',EXISTS(SELECT 1 FROM app.extra_order_line_link l WHERE(l.tenant_id,l.variation_id)=(e.tenant_id,e.variation_id)),
  'withdrawal',CASE WHEN w.id IS NOT NULL THEN jsonb_build_object('sourceId',w.id,'at',to_char(w.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'reason',w.reason_code,'scopeItemId',e.excess_of_scope_item_id) END) content
 FROM extras e LEFT JOIN LATERAL(SELECT x.* FROM app.extra_event x WHERE(x.tenant_id,x.job_id,x.variation_id)=(e.tenant_id,e.job_id,e.variation_id) AND x.kind='withdrawn' ORDER BY x.sequence DESC LIMIT 1) w ON true
), order_json AS (
 SELECT l.id,jsonb_build_object('jobId',l.job_id,'sourceId',l.id,'scopeItemId',l.scope_item_id,'sorVersionId',l.sor_version_id,'sorCode',l.sor_code,
  'at',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'quantity',l.quantity,'previousQuantity',previous.quantity,'unit',l.unit,'previousUnit',previous.unit) content
 FROM app.work_order_line l JOIN jobs j ON(j.tenant_id,j.job_id)=(l.tenant_id,l.job_id)
 JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(l.tenant_id,l.revision_id)
 LEFT JOIN LATERAL(SELECT old.quantity,old.unit FROM app.work_order_line old JOIN app.work_order_revision prior ON(prior.tenant_id,prior.id)=(old.tenant_id,old.revision_id)
  WHERE(old.tenant_id,old.work_order_id,old.scope_item_id)=(l.tenant_id,l.work_order_id,l.scope_item_id) AND prior.revision<r.revision ORDER BY prior.revision DESC LIMIT 1) previous ON true
), closeout_json AS (
 SELECT v.id,jsonb_build_object('jobId',v.job_id,'sourceId',coalesce(a.id,v.id),'at',to_char(v.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'dimensions',jsonb_build_object('region',j.region_id,'team',j.team_id,'operative',CASE WHEN m.role='operative' THEN v.membership_id END,'client',j.client_id,'contract',j.contract_id),'answer',a.answer) content
 FROM app.site_visit v JOIN jobs j ON(j.tenant_id,j.job_id)=(v.tenant_id,v.job_id)
 JOIN app.membership m ON(m.tenant_id,m.id)=(v.tenant_id,v.membership_id)
 LEFT JOIN app.closeout_answer a ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(v.tenant_id,v.job_id,v.id,v.membership_id)
 WHERE v.completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM covered_subjects cs WHERE(cs.tenant_id,cs.job_id,cs.membership_id)=(v.tenant_id,v.job_id,v.membership_id))
)
SELECT EXISTS(SELECT 1 FROM grants) authorized,
 jsonb_build_object('version','enterprise-dashboard-facts.v1','cutoff',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM extra_json),'[]'::jsonb),'closeouts',coalesce((SELECT jsonb_agg(content ORDER BY id) FROM closeout_json),'[]'::jsonb),'billing',jsonb_build_object('status','held','prerequisite','ENT-6B')) facts,
 jsonb_build_object('version','enterprise-signal-facts.v1','extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM signal_extra),'[]'::jsonb),
  'orderLines',coalesce((SELECT jsonb_agg(content ORDER BY id) FROM order_json),'[]'::jsonb),'billedVariations','[]'::jsonb,'closeouts','[]'::jsonb,'outlierPolicy',NULL) signals,
 coalesce((SELECT jsonb_agg(jsonb_build_object(
  'jobId',e.job_id,'extraId',e.variation_id,'exportLineId',l.id,'revisionId',l.revision_id,'runId',r.id,
  'factId',f.id,'inputHash',r.input_hash,'lineId',m.external_invoice_line_id,
  'billedNet',coalesce(summary->'billedNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'creditedNet',coalesce(summary->'creditedNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'paidNet',coalesce(summary->'matchedExtraNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'rejected',coalesce(summary->'rejected','false'::jsonb),'complete',summary IS NOT NULL AND jsonb_array_length(r.projection->'held')=0,
  'allocations',coalesce((SELECT jsonb_agg(a.id ORDER BY a.id) FROM app.contractor_receipt_line_allocation a
   WHERE(a.tenant_id,a.run_id,a.export_line_id)=(r.tenant_id,r.id,l.id)),'[]'::jsonb)
 ) ORDER BY l.id)
 FROM extras e JOIN app.billing_export_line l ON(l.tenant_id,l.job_id,l.extra_id)=(e.tenant_id,e.job_id,e.variation_id)
 JOIN app.billing_line_match m ON(m.tenant_id,m.line_job_id,m.export_line_id)=(l.tenant_id,l.job_id,l.id)
 JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id) AND f.payload->>'factType'='invoiced'
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
 LEFT JOIN LATERAL jsonb_array_elements(r.projection->'lines') summary ON summary->>'lineId'=m.external_invoice_line_id
 WHERE e.canonical_id=e.variation_id
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE(n.tenant_id,n.predecessor_id)=(r.tenant_id,r.id))
 ),'[]'::jsonb) billing
`;
/** Same shared tenant gate as the existing contractor reads; administration/imports take its exclusive counterpart. */
export const enterpriseDashboardScopeLockSql = "SELECT pg_advisory_xact_lock_shared(hashtextextended($1::uuid::text,54))";
