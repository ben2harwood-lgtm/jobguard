import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const sql=(name:string)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");
it("MON-9 explicitly gates the runtime election before session or replay",()=>{
 const body=sql("0614_mon9_database_gate.sql");
 expect(body.indexOf("IF current_database()<>'jobguard_synthetic_demo'")).toBeGreaterThan(0);
 expect(body.indexOf("IF current_database()")).toBeLessThan(body.indexOf("IF app.mon9_session"));
});
it("changed catch proof marks both writer and independent inputs as reduction-only",()=>{
 const body=sql("0615_success_fee_changed_proof.sql");
 expect(body.match(/changed_proof:=true;/gu)).toHaveLength(2);
 expect(body).toContain("IF changed_proof AND delta>0 THEN");
 expect(body).toContain("FROM app.success_fee_journal WHERE tenant_id=t AND job_id=j)");
 expect(body).toContain("IF invalid_reduction AND delta=0 THEN");
});
it("every current-state consumer gets the same exact attribution recheck",()=>{
 const body=sql("0616_payment_fee_current_review.sql");
 expect(body).toContain("PERFORM app.payment_fee_review_deadline(t,j,st.sources,actor)");
 expect(body.indexOf("PERFORM app.payment_fee_review_deadline")).toBeLessThan(body.indexOf("RETURN 'approved'"));
});
