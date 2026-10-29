import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
/** CI-only made-up company fixture. No application endpoint can backdate agreements or supply meter facts. */
export async function seedSubscriptionPeriod(tenantId: string, sessionToken: string) {
 const connectionString = process.env.E2E_ADMIN_DATABASE_URL;
 const secret = process.env.AUTH_CODE_SECRET;
 if (!connectionString || !secret) throw new Error("Subscription fixture requires the e2e setup environment");
 const admin=new Pool({connectionString});
 const db=await admin.connect();
 try {
  const digest=createHmac("sha256", secret).update(`session:${sessionToken}`).digest("hex");
  const {start_date:startDate,end_date:endDate}=(await db.query<{start_date:string;end_date:string}>(
   "SELECT to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/London')-interval '1 month','YYYY-MM-DD') start_date,to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/London'),'YYYY-MM-DD') end_date"
  )).rows[0]!;
  const start=new Date(`${startDate}T00:00:00Z`),end=new Date(`${endDate}T00:00:00Z`);
  const days=[];
  for(const day=new Date(start);day<end;day.setUTCDate(day.getUTCDate()+1))days.push({date:day.toISOString().slice(0,10),plan:"Builder",annualPrepaid:false,trial:false,jobs:[]});
  await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  // Historical synthetic fixture only, preserving the real acceptance/authorization parents.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.subscription_agreement_revision SET effective_date=$2::date WHERE tenant_id=$1",[tenantId,startDate]);
  await db.query("SET LOCAL session_replication_role='origin'");
  await db.query("SELECT app.mon1_store_fixture($1,$2,$3,$4::jsonb)",[tenantId,digest,randomUUID(),JSON.stringify({version:"meter-persisted-fixture.v1",environment:"synthetic_demo",startDate,endDateExclusive:endDate,days})]);
  await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)",[tenantId,digest,randomUUID(),JSON.stringify({version:"subscription-command.v1",kind:"issue",periodStart:startDate,expectedRevision:2})]);
  await db.query("COMMIT");
 } catch(error) {await db.query("ROLLBACK");throw error;}
 finally {db.release();await admin.end();}
}
