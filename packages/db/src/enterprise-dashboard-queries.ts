/** Single SELECT snapshot: current session, membership, dashboard grants, job AND operative scope precede aggregation.
 * Billing joins only matched exported lines after ENT-6's full-invoice allocation, at the same snapshot.
 * Output is an allowlist; no contact, free text, credential, provider or commercial command is selected.
 */
/** Shared authority prefix: session, membership, grants, job scope, operative coverage and duplicate groups. */
const dashboardAuthorityCtes = `
WITH actor AS MATERIALIZED (
 SELECT s.* FROM app.contractor_session($1::uuid) s
 WHERE s.tenant_id=$2::uuid AND s.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND current_database()='jobguard_synthetic_demo' AND app.contractor_member_active(s.membership_id)
), grants AS MATERIALIZED (
 SELECT g.* FROM app.role_grant g JOIN actor a ON(a.tenant_id,a.membership_id)=(g.tenant_id,g.membership_id)
 WHERE app.contractor_role_permits(g.role,'dashboard.read')
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
), candidate_jobs AS MATERIALIZED (
 -- Orders without an extra, visit or billing fact cannot contribute to this read.
 -- Fence this set before the per-job authority checks, even with stale bulk-load statistics.
 SELECT o.tenant_id,o.job_id FROM app.extra_origin o JOIN actor a ON a.tenant_id=o.tenant_id
 UNION
 SELECT v.tenant_id,v.job_id FROM app.site_visit v JOIN actor a ON a.tenant_id=v.tenant_id
 UNION
 SELECT f.tenant_id,f.job_id FROM app.billing_fact f JOIN actor a ON a.tenant_id=f.tenant_id
), jobs AS MATERIALIZED (
 SELECT w.tenant_id,w.job_id,w.id work_order_id,w.client_id,w.contract_id,t.id team_id,b.id branch_id,b.parent_id region_id
 FROM candidate_jobs candidate JOIN app.work_order w ON(w.tenant_id,w.job_id)=(candidate.tenant_id,candidate.job_id)
 JOIN actor a ON a.tenant_id=w.tenant_id
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
`;
/** One extra's allowlisted facts; expects `e` (an extras row) and the joins below. */
const dashboardExtraContent = `jsonb_build_object('jobId',e.job_id,'extraId',e.variation_id,'canonicalExtraId',e.canonical_id,
  'dimensions',jsonb_build_object('region',e.region_id,'team',e.team_id,'operative',CASE WHEN e.raising_role='operative' THEN e.raising_membership_id END,'client',e.client_id,'contract',e.contract_id),
  'capturedAt',to_char(e.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'capturedSourceId',e.command_id,
  'capturedValueSourceId',price.id,'capturedValue',CASE WHEN price.net IS NOT NULL THEN jsonb_build_object('pence',price.net,'currency','GBP') END,
  'approved',CASE WHEN outcome.kind='approved' AND q.net_pence IS NOT NULL AND q.binding_id=binding.id THEN jsonb_build_object(
   'sourceId',outcome.id,'revisionId',binding.source_revision_id,'at',to_char(outcome.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'value',jsonb_build_object('pence',q.net_pence,'currency','GBP')) END,
  'steps',coalesce(steps.content,'[]'::jsonb)) content`;
const dashboardExtraJoins = `LEFT JOIN requests q ON(q.tenant_id,q.variation_id)=(e.tenant_id,e.variation_id)
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
   'dueAt',to_char(app.xa_wait_deadline(coalesce(previous.server_recorded_at,q.server_recorded_at),step) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'completedAt',to_char(f.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'outcome',CASE WHEN f.id IS NOT NULL THEN 'approved' WHEN outcome.kind IS NOT NULL THEN outcome.kind ELSE 'pending' END) ORDER BY (step->>'index')::integer) content
  FROM jsonb_array_elements(q.requirement->'steps') step
  LEFT JOIN app.extra_approval_step_fact f ON(f.tenant_id,f.request_id,f.step_index)=(q.tenant_id,q.id,(step->>'index')::integer)
  LEFT JOIN app.extra_approval_step_fact previous ON(previous.tenant_id,previous.request_id,previous.step_index)=(q.tenant_id,q.id,(step->>'index')::integer-1)
  WHERE f.id IS NOT NULL OR (outcome.id IS NULL AND (step->>'index')::integer=(SELECT count(*) FROM app.extra_approval_step_fact done WHERE(done.tenant_id,done.request_id)=(q.tenant_id,q.id)))
 ) steps ON true`;
const dashboardSignalExtraSelect = (source: string) => ` SELECT e.variation_id,jsonb_build_object('jobId',e.job_id,'extraId',e.variation_id,'sourceId',e.command_id,'sorVersionId',e.sor_version_id,'sorCode',e.sor_code,
  'linked',EXISTS(SELECT 1 FROM app.extra_order_line_link l WHERE(l.tenant_id,l.variation_id)=(e.tenant_id,e.variation_id)),
  'withdrawal',CASE WHEN w.id IS NOT NULL THEN jsonb_build_object('sourceId',w.id,'at',to_char(w.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'reason',w.reason_code,'scopeItemId',e.excess_of_scope_item_id) END) content
 FROM ${source} e LEFT JOIN LATERAL(SELECT x.* FROM app.extra_event x WHERE(x.tenant_id,x.job_id,x.variation_id)=(e.tenant_id,e.job_id,e.variation_id) AND x.kind='withdrawn' ORDER BY x.sequence DESC LIMIT 1) w ON true`;
const dashboardOrderLineSelect = ` SELECT l.id,jsonb_build_object('jobId',l.job_id,'sourceId',l.id,'scopeItemId',l.scope_item_id,'sorVersionId',l.sor_version_id,'sorCode',l.sor_code,
  'at',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'quantity',l.quantity,'previousQuantity',previous.quantity,'unit',l.unit,'previousUnit',previous.unit) content
 FROM app.work_order_line l JOIN jobs j ON(j.tenant_id,j.job_id)=(l.tenant_id,l.job_id)
 JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(l.tenant_id,l.revision_id)
 LEFT JOIN LATERAL(SELECT old.quantity,old.unit FROM app.work_order_line old JOIN app.work_order_revision prior ON(prior.tenant_id,prior.id)=(old.tenant_id,old.revision_id)
  WHERE(old.tenant_id,old.work_order_id,old.scope_item_id)=(l.tenant_id,l.work_order_id,l.scope_item_id) AND prior.work_order_id=l.work_order_id AND prior.revision<r.revision ORDER BY prior.revision DESC LIMIT 1) previous ON true`;
const dashboardBilledSignalSelect = ` SELECT f.id, jsonb_build_object('jobId',f.job_id,'sourceId',f.id,'runId',r.id,
  'at',f.payload->>'effectiveAt','recordedAt',to_char(f.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'dimensions',jsonb_build_object('region',j.region_id,'team',j.team_id,'operative',NULL,'client',j.client_id,'contract',j.contract_id),
  'line',line,'billedNet',summary->'billedNet','creditedNet',summary->'creditedNet',
  'rejected',summary->'rejected','complete',jsonb_array_length(r.projection->'held')=0) content
 FROM app.billing_fact f JOIN jobs j ON(j.tenant_id,j.job_id,j.contract_id)=(f.tenant_id,f.job_id,f.client_contract_id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
 CROSS JOIN LATERAL jsonb_array_elements(f.payload->'composition'->'lines') line
 JOIN LATERAL jsonb_array_elements(r.projection->'lines') summary ON summary->>'lineId'=line->>'externalInvoiceLineId'
 WHERE f.match_valid AND f.payload->>'factType'='invoiced' AND line->>'kind'='other' AND line->'match'='null'::jsonb
 AND NOT EXISTS(SELECT 1 FROM app.billing_quarantine q WHERE(q.tenant_id,q.fact_id)=(f.tenant_id,f.id))
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE(n.tenant_id,n.predecessor_id)=(r.tenant_id,r.id))
 -- A newly imported fact without a successor run must never reuse a stale balance.
 AND NOT EXISTS(SELECT 1 FROM app.billing_fact newer WHERE(newer.tenant_id,newer.job_id,newer.source,newer.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
  AND newer.server_recorded_at>r.server_recorded_at)`;
const dashboardBillingRowObject = `jsonb_build_object(
  'jobId',e.job_id,'extraId',e.variation_id,'exportLineId',l.id,'revisionId',l.revision_id,'runId',r.id,
  'factId',f.id,'inputHash',r.input_hash,'lineId',m.external_invoice_line_id,
  'billedNet',coalesce(summary->'billedNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'creditedNet',coalesce(summary->'creditedNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'paidNet',coalesce(summary->'matchedExtraNet','{"numerator":"0","denominator":"1"}'::jsonb),
  'rejected',coalesce(summary->'rejected','false'::jsonb),'complete',summary IS NOT NULL AND jsonb_array_length(r.projection->'held')=0,
  'allocations',coalesce((SELECT jsonb_agg(a.id ORDER BY a.id) FROM app.contractor_receipt_line_allocation a
   WHERE(a.tenant_id,a.run_id,a.export_line_id)=(r.tenant_id,r.id,l.id)),'[]'::jsonb)
 )`;
/** Matched export lines of canonical extras in `source`, at their latest allocation run. */
const dashboardBillingRowsFrom = (source: string) => `
 FROM ${source} e JOIN app.billing_export_line l ON(l.tenant_id,l.job_id,l.extra_id)=(e.tenant_id,e.job_id,e.variation_id)
 JOIN app.billing_line_match m ON(m.tenant_id,m.line_job_id,m.export_line_id)=(l.tenant_id,l.job_id,l.id)
 JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id) AND f.payload->>'factType'='invoiced'
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
 LEFT JOIN LATERAL jsonb_array_elements(r.projection->'lines') summary ON summary->>'lineId'=m.external_invoice_line_id
 WHERE e.canonical_id=e.variation_id
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE(n.tenant_id,n.predecessor_id)=(r.tenant_id,r.id))`;
const dashboardBillingRows = (source: string) => ` coalesce((SELECT jsonb_agg(${dashboardBillingRowObject} ORDER BY l.id)${dashboardBillingRowsFrom(source)}
 ),'[]'::jsonb)`;
export const enterpriseDashboardSourceSql = `${dashboardAuthorityCtes}), requests AS MATERIALIZED (
 SELECT q.* FROM app.extra_approval_request q JOIN extras e ON(e.tenant_id,e.job_id,e.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
 WHERE q.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE(x.tenant_id,x.variation_id)=(q.tenant_id,q.variation_id))
), extra_json AS (
 SELECT e.variation_id,${dashboardExtraContent}
 FROM extras e ${dashboardExtraJoins}
), signal_extra AS (
${dashboardSignalExtraSelect("extras")}
), order_json AS (
${dashboardOrderLineSelect}
), closeout_json AS (
 SELECT v.id,jsonb_build_object('jobId',v.job_id,'sourceId',coalesce(a.id,v.id),'at',to_char(v.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'dimensions',jsonb_build_object('region',j.region_id,'team',j.team_id,'operative',CASE WHEN m.role='operative' THEN v.membership_id END,'client',j.client_id,'contract',j.contract_id),'answer',a.answer) content
 FROM app.site_visit v JOIN jobs j ON(j.tenant_id,j.job_id)=(v.tenant_id,v.job_id)
 JOIN app.membership m ON(m.tenant_id,m.id)=(v.tenant_id,v.membership_id)
 LEFT JOIN app.closeout_answer a ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(v.tenant_id,v.job_id,v.id,v.membership_id)
 WHERE v.completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM covered_subjects cs WHERE(cs.tenant_id,cs.job_id,cs.membership_id)=(v.tenant_id,v.job_id,v.membership_id))
), billed_signal_json AS (
${dashboardBilledSignalSelect}
)
SELECT EXISTS(SELECT 1 FROM grants) authorized,
 jsonb_build_object('version','enterprise-dashboard-facts.v1','cutoff',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM extra_json),'[]'::jsonb),'closeouts',coalesce((SELECT jsonb_agg(content ORDER BY id) FROM closeout_json),'[]'::jsonb),'billing',jsonb_build_object('status','held','prerequisite','ENT-6B')) facts,
 jsonb_build_object('version','enterprise-signal-facts.v1','extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM signal_extra),'[]'::jsonb),
  'orderLines',coalesce((SELECT jsonb_agg(content ORDER BY id) FROM order_json),'[]'::jsonb),'billedVariations','[]'::jsonb,'closeouts','[]'::jsonb,'outlierPolicy',NULL) signals,
 jsonb_build_object('version','enterprise-billed-signal-rows.v1','rows',coalesce((SELECT jsonb_agg(content ORDER BY id,content->'line'->>'externalInvoiceLineId') FROM billed_signal_json),'[]'::jsonb)) signal_billing,
${dashboardBillingRows("extras")} billing
`;
/** Same shared tenant gate as the existing contractor reads; administration/imports take its exclusive counterpart. */
export const enterpriseDashboardScopeLockSql = "SELECT pg_advisory_xact_lock_shared(hashtextextended($1::uuid::text,54))";

/** Largest array a signal, facts or billing-row input may carry; above it the read says so instead of truncating. */
export const dashboardInputBound = 100000;
const inPeriod = (at: string) => `${at}>=(sel.p->>'from')::timestamptz AND ${at}<(sel.p->>'until')::timestamptz`;
/** Filter keys absent from the request match everything; a present key (including null) must match exactly. */
const matchesFilters = (column: (key: "region" | "team" | "operative" | "client" | "contract") => string) => (["region", "team", "operative", "client", "contract"] as const)
  .map(key => ` AND (NOT (sel.p->'filters' ? '${key}') OR ${column(key)} IS NOT DISTINCT FROM (sel.p->'filters'->>'${key}')::uuid)`).join("");
const jobColumns = (alias: string, operative: string) => (key: string) => key === "operative" ? operative : `${alias}.${key}_id`;
const jsonColumns = (json: string) => (key: string) => key === "operative" ? "NULL::uuid" : `(${json}->'dimensions'->>'${key}')::uuid`;
const operativeOf = (alias: string) => `CASE WHEN ${alias}.raising_role='operative' THEN ${alias}.raising_membership_id END`;
const sortedText = (array: string) => `ARRAY(SELECT x FROM unnest(${array}) x WHERE x IS NOT NULL ORDER BY x COLLATE "C")`;
const contributionJson = (c: string) => `jsonb_build_object('stage',${c}.stage,'jobId',${c}.job_id,'extraIds',to_jsonb(${c}.extra_ids),'sourceIds',to_jsonb(${c}.source_ids),
  'value',CASE WHEN ${c}.value IS NOT NULL THEN jsonb_build_object('pence',${c}.value,'currency','GBP') END,'group',${c}.grp)`;
/** The reference projection's order: extras by id (capture, approval, steps by id), then close-outs by source. */
const order = (c: string) => `${c}.family,${c}.k1 COLLATE "C",${c}.seq,${c}.k2 COLLATE "C",${c}.sub`;
/** The figure a row belongs to under the requested grouping (period = the requested interval). */
const groupOf = (x: string) => `CASE sel.p->>'dimension' WHEN 'region' THEN ${x}.region_id::text WHEN 'team' THEN ${x}.team_id::text WHEN 'operative' THEN ${x}.operative_id::text
  WHEN 'client' THEN ${x}.client_id::text WHEN 'contract' THEN ${x}.contract_id::text ELSE sel.p->>'periodLabel' END`;
const resourceIs = (resource: "activity" | "billing") => `(SELECT sel.p->>'resource' FROM sel)='${resource}'`;
const fraction = (json: string, part: "numerator" | "denominator") => `(${json}->>'${part}')::numeric`;
const billingRowJson = (c: string) => `jsonb_build_object('stage',${c}.stage,'jobId',${c}.content->'jobId','extraId',${c}.content->'extraId','group',${c}.grp,
  'exportLineId',${c}.content->'exportLineId','revisionId',${c}.content->'revisionId','runId',${c}.content->'runId','factId',${c}.content->'factId',
  'inputHash',${c}.content->'inputHash','allocationIds',${c}.content->'allocations','exactPence',jsonb_build_object('numerator',${c}.num::text,'denominator',${c}.den::text))`;
/** Exact fraction sums: every numerator is scaled to one common denominator (the lcm in billing_scale). */
const billingTotalsJson = (where: string) => `coalesce((SELECT jsonb_object_agg(t.stage,jsonb_build_object('count',t.n,'numerator',t.total::text))
  FROM (SELECT c.stage,count(*) n,sum(c.num*div(s.l,c.den)) total FROM billing_contributions c CROSS JOIN billing_scale s WHERE ${where} GROUP BY c.stage) t),'{}'::jsonb)`;
const totalsJson = (where: string) => `coalesce((SELECT jsonb_object_agg(t.stage,jsonb_build_object('count',t.n,'known',t.known::text,'unknownCount',t.unknown))
  FROM (SELECT c.stage,count(*) n,coalesce(sum(c.value),0) known,count(*) FILTER(WHERE c.value IS NULL) unknown FROM contributions c WHERE ${where} GROUP BY c.stage) t),'{}'::jsonb)`;
/**
 * EP-F6 bounded read. The authority CTEs are the SAME text as `enterpriseDashboardSourceSql`; period and dimension
 * filters apply only after them, to canonical captures and completed visits. Totals, groups and close-out counts are
 * aggregated here over every selected row, with exact bigint sums; stored billed/paid balances are grouped and summed
 * here as exact fractions over one common denominator. Only one page of groups and one page of each drill-down leave
 * the database. `$3.resource` selects activity or billing, so a read builds only its own figures. Facts/signal/billing inputs are built only when within `dashboardInputBound`;
 * otherwise their counts are returned so the caller can say so. $3 is the server-built selection (never client SQL).
 */
export const enterpriseDashboardSelectionSql = `${dashboardAuthorityCtes}), sel AS MATERIALIZED (
 SELECT $3::jsonb p,statement_timestamp() cutoff
), selected AS MATERIALIZED (
 SELECT e.*,${operativeOf("e")} operative_id FROM extras e CROSS JOIN sel
 WHERE e.canonical_id=e.variation_id AND ${inPeriod("e.server_recorded_at")}${matchesFilters(jobColumns("e", operativeOf("e")))}
), members AS MATERIALIZED (
 SELECT m.* FROM extras m JOIN selected s ON(s.tenant_id,s.job_id,s.variation_id)=(m.tenant_id,m.job_id,m.canonical_id)
), requests AS MATERIALIZED (
 SELECT q.* FROM app.extra_approval_request q JOIN members e ON(e.tenant_id,e.job_id,e.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
 WHERE q.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE(x.tenant_id,x.variation_id)=(q.tenant_id,q.variation_id))
), extra_rows AS MATERIALIZED (
 SELECT e.tenant_id,e.job_id,e.variation_id,e.canonical_id,e.command_id,price.id::text price_id,price.net::bigint price_net,
  CASE WHEN outcome.kind='approved' AND q.net_pence IS NOT NULL AND q.binding_id=binding.id THEN ARRAY[outcome.id::text,binding.source_revision_id::text] END approved_sources,
  q.net_pence::bigint approved_net,coalesce(steps.content,'[]'::jsonb) steps_json,${dashboardExtraContent}
 FROM members e ${dashboardExtraJoins}
), base AS MATERIALIZED (
 SELECT c.tenant_id,c.job_id,c.variation_id,c.region_id,c.team_id,c.operative_id,c.client_id,c.contract_id,r.price_id,r.price_net,r.steps_json,
  CASE WHEN r.approved_sources IS NOT NULL THEN r.approved_net END approved_net,r.approved_sources,
  (SELECT array_agg(m.variation_id::text ORDER BY m.variation_id::text COLLATE "C") FROM extra_rows m WHERE(m.tenant_id,m.job_id,m.canonical_id)=(c.tenant_id,c.job_id,c.variation_id)) extra_ids,
  (SELECT array_agg(m.command_id::text) FROM extra_rows m WHERE(m.tenant_id,m.job_id,m.canonical_id)=(c.tenant_id,c.job_id,c.variation_id)) commands
 FROM selected c JOIN extra_rows r ON(r.tenant_id,r.job_id,r.variation_id)=(c.tenant_id,c.job_id,c.variation_id)
), visits AS MATERIALIZED (
 SELECT v.tenant_id,v.job_id,v.id,coalesce(a.id,v.id) source_id,v.completed_at,a.answer,j.region_id,j.team_id,
  CASE WHEN m.role='operative' THEN v.membership_id END operative_id,j.client_id,j.contract_id
 FROM app.site_visit v JOIN jobs j ON(j.tenant_id,j.job_id)=(v.tenant_id,v.job_id)
 JOIN app.membership m ON(m.tenant_id,m.id)=(v.tenant_id,v.membership_id)
 LEFT JOIN app.closeout_answer a ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(v.tenant_id,v.job_id,v.id,v.membership_id)
 WHERE v.completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM covered_subjects cs WHERE(cs.tenant_id,cs.job_id,cs.membership_id)=(v.tenant_id,v.job_id,v.membership_id))
), selected_visits AS MATERIALIZED (
 SELECT v.* FROM visits v CROSS JOIN sel WHERE ${inPeriod("v.completed_at")}${matchesFilters(jobColumns("v", "v.operative_id"))}
), contributions AS MATERIALIZED (
 SELECT x.*,${groupOf("x")} grp
 FROM sel CROSS JOIN (
  SELECT 'captured'::text stage,0 family,0 seq,0 sub,b.job_id,b.variation_id::text k1,''::text k2,b.extra_ids,${sortedText("b.commands||b.price_id")} source_ids,b.price_net value,
   b.region_id,b.team_id,b.operative_id,b.client_id,b.contract_id FROM base b
  UNION ALL
  SELECT 'approved',0,1,0,b.job_id,b.variation_id::text,'',b.extra_ids,${sortedText("b.approved_sources")},b.approved_net,
   b.region_id,b.team_id,b.operative_id,b.client_id,b.contract_id FROM base b WHERE b.approved_sources IS NOT NULL
  UNION ALL
  SELECT st.stage,0,2,st.sub,b.job_id,b.variation_id::text,step->>'id',b.extra_ids,
   ${sortedText("ARRAY[step->>'id']||ARRAY(SELECT jsonb_array_elements_text(step->'sourceIds'))")},NULL::bigint,
   b.region_id,b.team_id,b.operative_id,b.client_id,b.contract_id
  FROM base b CROSS JOIN sel s CROSS JOIN LATERAL jsonb_array_elements(b.steps_json) step
  CROSS JOIN LATERAL (VALUES
   (CASE WHEN step->>'outcome'='pending' THEN 'backlog' END,0),
   (CASE WHEN step->>'outcome'='pending' AND step->>'dueAt' IS NOT NULL AND s.cutoff>(step->>'dueAt')::timestamptz THEN 'overdue' END,1),
   (CASE WHEN step->>'outcome'='approved' AND step->>'completedAt' IS NOT NULL AND step->>'dueAt' IS NOT NULL
     THEN CASE WHEN (step->>'completedAt')::timestamptz<=(step->>'dueAt')::timestamptz THEN 'onTime' ELSE 'late' END END,0)
  ) st(stage,sub) WHERE st.stage IS NOT NULL
  UNION ALL
  SELECT CASE v.answer WHEN 'yes' THEN 'closeoutYes' WHEN 'no' THEN 'closeoutNo' ELSE 'closeoutMissing' END,1,0,0,v.job_id,v.source_id::text,'',ARRAY[]::text[],ARRAY[v.source_id::text],NULL::bigint,
   v.region_id,v.team_id,v.operative_id,v.client_id,v.contract_id FROM selected_visits v
 ) x
), ranked AS MATERIALIZED (
 SELECT c.*,row_number() OVER(PARTITION BY c.stage ORDER BY ${order("c")}) stage_rank,
  row_number() OVER(PARTITION BY c.grp,c.stage ORDER BY ${order("c")}) group_rank
 FROM contributions c
), group_page AS MATERIALIZED (
 SELECT g.grp,g.n FROM (SELECT d.grp,row_number() OVER(ORDER BY coalesce(d.grp,'') COLLATE "C") n FROM (SELECT DISTINCT grp FROM contributions) d) g CROSS JOIN sel
 WHERE g.n>(sel.p->>'groupOffset')::bigint AND g.n<=(sel.p->>'groupOffset')::bigint+(sel.p->>'groupLimit')::bigint
), drill AS MATERIALIZED (
 SELECT r.*,CASE WHEN (sel.p->'drill'->>'hasGroup')::boolean THEN r.group_rank ELSE r.stage_rank END drill_rank FROM ranked r CROSS JOIN sel
 WHERE jsonb_typeof(sel.p->'drill')='object' AND r.stage=sel.p->'drill'->>'stage'
  AND (NOT (sel.p->'drill'->>'hasGroup')::boolean OR r.grp IS NOT DISTINCT FROM sel.p->'drill'->>'group')
), billed_signal_json AS (
${dashboardBilledSignalSelect}
), dims AS (
 SELECT e.region_id,e.team_id,${operativeOf("e")} operative_id,e.client_id,e.contract_id FROM extras e
 UNION ALL SELECT v.region_id,v.team_id,v.operative_id,v.client_id,v.contract_id FROM visits v
 UNION ALL SELECT (b.content->'dimensions'->>'region')::uuid,(b.content->'dimensions'->>'team')::uuid,NULL::uuid,
  (b.content->'dimensions'->>'client')::uuid,(b.content->'dimensions'->>'contract')::uuid FROM billed_signal_json b
), signal_extra AS (
${dashboardSignalExtraSelect("members")}
), order_json AS (
${dashboardOrderLineSelect}
 CROSS JOIN sel
 WHERE (l.tenant_id,l.job_id) IN (SELECT tenant_id,job_id FROM selected UNION SELECT tenant_id,job_id FROM selected_visits) AND ${inPeriod("r.created_at")}
), selected_billed_signals AS MATERIALIZED (
 SELECT b.* FROM billed_signal_json b CROSS JOIN sel
 WHERE ${inPeriod("(b.content->>'at')::timestamptz")}${matchesFilters(jsonColumns("b.content"))}
), billing_rows AS MATERIALIZED (
 -- EP-F6: stored ENT-6 balances for the selected canonical extras only; grouped and paged below, never collected whole.
 SELECT e.region_id,e.team_id,e.operative_id,e.client_id,e.contract_id,e.variation_id extra_id,l.id::text export_line_id,${dashboardBillingRowObject} content
 ${dashboardBillingRowsFrom("selected")}
), billing_contributions AS MATERIALIZED (
 SELECT x.*,${groupOf("x")} grp FROM sel CROSS JOIN (
  SELECT 'billed'::text stage,b.*,${fraction("b.content->'billedNet'", "numerator")}*${fraction("b.content->'creditedNet'", "denominator")}
   -${fraction("b.content->'creditedNet'", "numerator")}*${fraction("b.content->'billedNet'", "denominator")} num,
   ${fraction("b.content->'billedNet'", "denominator")}*${fraction("b.content->'creditedNet'", "denominator")} den
  FROM billing_rows b WHERE NOT (b.content->>'rejected')::boolean
  UNION ALL
  SELECT 'paid',b.*,${fraction("b.content->'paidNet'", "numerator")},${fraction("b.content->'paidNet'", "denominator")}
  FROM billing_rows b WHERE NOT (b.content->>'rejected')::boolean
 ) x WHERE x.num>0 AND x.den>0
), billing_scale AS MATERIALIZED (
 WITH RECURSIVE d AS (SELECT u.den,row_number() OVER(ORDER BY u.den) n FROM (SELECT DISTINCT den FROM billing_contributions) u),
  f(n,l) AS (SELECT 0::bigint,1::numeric UNION ALL SELECT f.n+1,lcm(f.l,d.den) FROM f JOIN d ON d.n=f.n+1)
 SELECT l FROM f ORDER BY n DESC LIMIT 1
), billing_ranked AS MATERIALIZED (
 SELECT c.*,row_number() OVER(PARTITION BY c.stage ORDER BY c.export_line_id COLLATE "C") stage_rank,
  row_number() OVER(PARTITION BY c.grp,c.stage ORDER BY c.export_line_id COLLATE "C") group_rank
 FROM billing_contributions c
), billing_group_page AS MATERIALIZED (
 SELECT g.grp,g.n FROM (SELECT d.grp,row_number() OVER(ORDER BY coalesce(d.grp,'') COLLATE "C") n FROM (SELECT DISTINCT grp FROM billing_contributions) d) g CROSS JOIN sel
 WHERE g.n>(sel.p->>'groupOffset')::bigint AND g.n<=(sel.p->>'groupOffset')::bigint+(sel.p->>'groupLimit')::bigint
), billing_drill AS MATERIALIZED (
 SELECT r.*,CASE WHEN (sel.p->'drill'->>'hasGroup')::boolean THEN r.group_rank ELSE r.stage_rank END drill_rank FROM billing_ranked r CROSS JOIN sel
 WHERE jsonb_typeof(sel.p->'drill')='object' AND r.stage=sel.p->'drill'->>'stage'
  AND (NOT (sel.p->'drill'->>'hasGroup')::boolean OR r.grp IS NOT DISTINCT FROM sel.p->'drill'->>'group')
), counts AS MATERIALIZED (
 -- Signal inputs exist only for activity reads; billing reads never build them.
 SELECT a.* FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT (SELECT count(*) FROM members) members,(SELECT count(*) FROM selected_visits) visits,
  (SELECT count(*) FROM order_json) order_lines,(SELECT count(*) FROM selected_billed_signals) billed_signals WHERE ${resourceIs("activity")}) a ON true
)
SELECT EXISTS(SELECT 1 FROM grants) authorized,
 NOT EXISTS(SELECT 1 FROM extras d JOIN extras c ON(c.tenant_id,c.job_id,c.variation_id)=(d.tenant_id,d.job_id,d.canonical_id) WHERE c.canonical_id<>c.variation_id)
  AND NOT EXISTS(SELECT 1 FROM extra_rows r WHERE r.price_net<0 OR r.approved_net<0) integrity,
 (SELECT NOT EXISTS(SELECT 1 FROM jsonb_each(sel.p->'filters') f WHERE NOT EXISTS(SELECT 1 FROM dims d WHERE
   (CASE f.key WHEN 'region' THEN d.region_id WHEN 'team' THEN d.team_id WHEN 'operative' THEN d.operative_id WHEN 'client' THEN d.client_id ELSE d.contract_id END)
    IS NOT DISTINCT FROM (f.value #>> '{}')::uuid)) FROM sel) activity_visible,
 (SELECT NOT EXISTS(SELECT 1 FROM jsonb_each(sel.p->'filters') f WHERE NOT EXISTS(SELECT 1 FROM extras e WHERE
   (CASE f.key WHEN 'region' THEN e.region_id WHEN 'team' THEN e.team_id WHEN 'operative' THEN ${operativeOf("e")} WHEN 'client' THEN e.client_id ELSE e.contract_id END)
    IS NOT DISTINCT FROM (f.value #>> '{}')::uuid)) FROM sel) billing_visible,
 (SELECT to_jsonb(k) FROM counts k) counts,
 CASE WHEN ${resourceIs("activity")} THEN jsonb_build_object('version','enterprise-dashboard-aggregate.v1','cutoff',to_char((SELECT cutoff FROM sel) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'sourceHash',encode(sha256(coalesce((SELECT string_agg(sha256(convert_to(concat_ws('|',c.stage,c.job_id,c.k1,c.k2,array_to_string(c.extra_ids,','),
    array_to_string(c.source_ids,','),coalesce(c.value::text,'-'),coalesce(c.grp,'-')),'UTF8')),'' ORDER BY c.stage COLLATE "C",${order("c")}) FROM contributions c),''::bytea)),'hex'),
  'totals',${totalsJson("true")},
  'groupCount',(SELECT count(*) FROM (SELECT DISTINCT grp FROM contributions) d),
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.grp,'totals',${totalsJson("c.grp IS NOT DISTINCT FROM g.grp")},
    'contributions',coalesce((SELECT jsonb_agg(${contributionJson("r")} ORDER BY ${order("r")}) FROM ranked r CROSS JOIN sel
     WHERE r.grp IS NOT DISTINCT FROM g.grp AND r.group_rank<=(sel.p->>'groupPageLimit')::bigint),'[]'::jsonb)) ORDER BY g.n) FROM group_page g),'[]'::jsonb),
  'contributions',coalesce((SELECT jsonb_agg(${contributionJson("r")} ORDER BY ${order("r")}) FROM ranked r CROSS JOIN sel
   WHERE r.stage_rank<=(sel.p->>'pageLimit')::bigint),'[]'::jsonb),
  'drilldown',(SELECT CASE WHEN jsonb_typeof(sel.p->'drill')='object' THEN jsonb_build_object('total',(SELECT count(*) FROM drill),
   'contributions',coalesce((SELECT jsonb_agg(${contributionJson("d")} ORDER BY d.drill_rank) FROM drill d
    WHERE d.drill_rank>(sel.p->'drill'->>'offset')::bigint AND d.drill_rank<=(sel.p->'drill'->>'offset')::bigint+(sel.p->'drill'->>'limit')::bigint),'[]'::jsonb)) END FROM sel)
 ) END report,
 CASE WHEN ${resourceIs("billing")} THEN (SELECT count(*)=count(DISTINCT extra_id) FROM billing_rows) AND NOT EXISTS(SELECT 1 FROM billing_rows b WHERE
  ${fraction("b.content->'billedNet'", "denominator")}<=0 OR ${fraction("b.content->'creditedNet'", "denominator")}<=0 OR ${fraction("b.content->'paidNet'", "denominator")}<=0) END billing_integrity,
 CASE WHEN ${resourceIs("billing")} THEN jsonb_build_object('version','enterprise-dashboard-billing-aggregate.v1',
  'sourceHash',encode(sha256(coalesce((SELECT string_agg(sha256(convert_to(concat_ws('|',b.content::text,coalesce(b.region_id::text,'-'),b.team_id,coalesce(b.operative_id::text,'-'),
    b.client_id,b.contract_id),'UTF8')),'' ORDER BY b.export_line_id COLLATE "C") FROM billing_rows b),''::bytea)),'hex'),
  'scale',(SELECT l::text FROM billing_scale),
  'totals',${billingTotalsJson("true")},
  'groupCount',(SELECT count(*) FROM (SELECT DISTINCT grp FROM billing_contributions) d),
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.grp,'totals',${billingTotalsJson("c.grp IS NOT DISTINCT FROM g.grp")},
    'contributions',coalesce((SELECT jsonb_agg(${billingRowJson("r")} ORDER BY r.stage,r.export_line_id COLLATE "C") FROM billing_ranked r CROSS JOIN sel
     WHERE r.grp IS NOT DISTINCT FROM g.grp AND r.group_rank<=(sel.p->>'groupPageLimit')::bigint),'[]'::jsonb)) ORDER BY g.n) FROM billing_group_page g),'[]'::jsonb),
  'contributions',coalesce((SELECT jsonb_agg(${billingRowJson("r")} ORDER BY r.stage,r.export_line_id COLLATE "C") FROM billing_ranked r CROSS JOIN sel
   WHERE r.stage_rank<=(sel.p->>'pageLimit')::bigint),'[]'::jsonb),
  'drilldown',(SELECT CASE WHEN jsonb_typeof(sel.p->'drill')='object' THEN jsonb_build_object('total',(SELECT count(*) FROM billing_drill),
   'contributions',coalesce((SELECT jsonb_agg(${billingRowJson("d")} ORDER BY d.drill_rank) FROM billing_drill d
    WHERE d.drill_rank>(sel.p->'drill'->>'offset')::bigint AND d.drill_rank<=(sel.p->'drill'->>'offset')::bigint+(sel.p->'drill'->>'limit')::bigint),'[]'::jsonb)) END FROM sel),
  'heldCount',(SELECT count(*) FROM billing_rows b WHERE NOT (b.content->>'complete')::boolean),
  'held',(SELECT CASE WHEN count(*)<=${dashboardInputBound} THEN coalesce(jsonb_agg(jsonb_build_object('extraId',b.extra_id,'runId',b.content->'runId') ORDER BY b.export_line_id COLLATE "C"),'[]'::jsonb) END
   FROM billing_rows b WHERE NOT (b.content->>'complete')::boolean)
 ) END billing_report,
 CASE WHEN ${resourceIs("activity")} AND k.members<=${dashboardInputBound} AND k.visits<=${dashboardInputBound} THEN jsonb_build_object('version','enterprise-dashboard-facts.v1',
  'cutoff',to_char((SELECT cutoff FROM sel) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM extra_rows),'[]'::jsonb),
  'closeouts',coalesce((SELECT jsonb_agg(jsonb_build_object('jobId',v.job_id,'sourceId',v.source_id,'at',to_char(v.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'dimensions',jsonb_build_object('region',v.region_id,'team',v.team_id,'operative',v.operative_id,'client',v.client_id,'contract',v.contract_id),'answer',v.answer) ORDER BY v.id) FROM selected_visits v),'[]'::jsonb),
  'billing',jsonb_build_object('status','held','prerequisite','ENT-6B')) END facts,
 CASE WHEN ${resourceIs("activity")} AND k.members<=${dashboardInputBound} AND k.order_lines<=${dashboardInputBound} THEN jsonb_build_object('version','enterprise-signal-facts.v1',
  'extras',coalesce((SELECT jsonb_agg(content ORDER BY variation_id) FROM signal_extra),'[]'::jsonb),
  'orderLines',coalesce((SELECT jsonb_agg(content ORDER BY id) FROM order_json),'[]'::jsonb),'billedVariations','[]'::jsonb,'closeouts','[]'::jsonb,'outlierPolicy',NULL) END signals,
 CASE WHEN ${resourceIs("activity")} AND k.billed_signals<=${dashboardInputBound} THEN jsonb_build_object('version','enterprise-billed-signal-rows.v1',
  'rows',coalesce((SELECT jsonb_agg(content ORDER BY id,content->'line'->>'externalInvoiceLineId') FROM selected_billed_signals),'[]'::jsonb)) END signal_billing
FROM counts k
`;
