import {readFile} from "node:fs/promises";
import {expect,it} from "vitest";
import {MIGRATION_URLS} from "./migrate.js";
it("discovers the additive movement migration once and validates both FKs without changing facts or privileges",async()=>{
 const name="0407_receipt_movement_job_fk.sql";
 expect(MIGRATION_URLS.filter(url=>url.pathname.endsWith(`/${name}`))).toHaveLength(1);
 const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
 expect(sql).toMatch(/^BEGIN;/u);expect(sql).toMatch(/COMMIT;\s*$/u);
 expect(sql.match(/NOT VALID;/gu)).toHaveLength(2);
 expect(sql.match(/VALIDATE CONSTRAINT /gu)).toHaveLength(2);
 expect(sql).toContain("FOREIGN KEY(tenant_id,job_id,movement_id)\n REFERENCES app.practice_feed_event(tenant_id,job_id,id) NOT VALID;");
 expect(sql).toContain("ADD CONSTRAINT receipt_allocation_fact_source_tenant_id_movement_id_fkey");
 expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE)\b/u);
 expect(sql).not.toContain("DROP CONSTRAINT receipt_allocation_fact_source_tenant_id_movement_id_fkey");
});
