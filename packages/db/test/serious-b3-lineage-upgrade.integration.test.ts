import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
import { QuoteRepository, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let c: Awaited<ReturnType<typeof clusterBefore>>;
beforeAll(async()=>{c=await clusterBefore("0172_quote_scope_lineage.sql");},120_000);
afterAll(async()=>{await c?.close();});
it("S09 upgrades populated quote lineage without changing immutable rows, grants or RLS",async()=>{
  const tenant=randomUUID(),job=randomUUID(),scope=randomUUID(),revision=randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
  const context=testTenantContext(tenant);
  await withTenant(c.runtime,context,async db=>{
    await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic lineage upgrade','quoting')",[job,tenant]);
    await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);
    await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Synthetic work','1','item',10000,10000)",[revision,tenant,job,scope]);
  });
  await new QuoteRepository(c.runtime).saveDraft(context,{jobId:job,draftId:randomUUID(),expectedRevision:0,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",effectiveAt:new Date("2026-10-16T10:00:00Z"),lines:[{id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Synthetic work",origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:10000,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:null,region:null}]});
  const tables=["app.scope_revision","app.quote_draft","app.quote_revision","app.quote_line","app.rate_book_observation","app.audit_event"];
  const proof=await proofBefore(c.admin,tables);
  const security=async()=> (await c.admin.query("SELECT relname,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY relname",[tables])).rows;
  const beforeSecurity=await security();
  await c.migrate();
  expect(await proofDifferences(c.admin,proof)).toEqual({rows:[],types:[]});
  expect(await security()).toEqual(beforeSecurity);
  const catalog=(await c.admin.query("SELECT conname,convalidated,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname IN('quote_line_item_source_fk','rate_observation_item_source_fk') ORDER BY conname")).rows;
  expect(catalog).toHaveLength(2);
  expect(catalog.every(row=>row.convalidated===true)).toBe(true);
  expect(catalog.every(row=>row.definition.includes("REFERENCES app.scope_revision(tenant_id, job_id, scope_item_id, id)"))).toBe(true);
  await c.migrate();
  expect(await proofDifferences(c.admin,proof)).toEqual({rows:[],types:[]});
  // A populated predecessor with corrupt provenance must fail validation, without silently rewriting it.
  await rolledBack(c.admin,async db=>{
    await db.query("ALTER TABLE app.quote_line DROP CONSTRAINT quote_line_item_source_fk");
    await db.query("ALTER TABLE app.quote_line DISABLE TRIGGER quote_line_immutable");
    const other=randomUUID(),otherRevision=randomUUID();
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[other,tenant,job]);
    await db.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit) VALUES($1,$2,$3,$4,1,'Synthetic other item','1','item')",[otherRevision,tenant,job,other]);
    await db.query("UPDATE app.quote_line SET scope_revision_id=$1 WHERE job_id=$2",[otherRevision,job]);
    await expect(db.query("ALTER TABLE app.quote_line ADD CONSTRAINT quote_line_item_source_fk FOREIGN KEY(tenant_id,job_id,scope_item_id,scope_revision_id) REFERENCES app.scope_revision(tenant_id,job_id,scope_item_id,id)")).rejects.toMatchObject({code:"23503"});
  });
  expect(await proofDifferences(c.admin,proof)).toEqual({rows:[],types:[]});
});
