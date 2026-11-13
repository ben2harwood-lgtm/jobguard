import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const firmProfileV1 = z.object({
 version: z.literal("firm-profile.v1"),
 tradingName: z.string().trim().min(1).max(120),
 addressLines: z.array(z.string().trim().min(1).max(160)).max(3),
 contactEmail: z.union([z.literal(""), z.email().max(320)]),
 contactPhone: z.string().trim().max(80),
}).strict();
export type FirmProfile = z.infer<typeof firmProfileV1>;
export class FirmProfileError extends Error {
 constructor(readonly code: "FORBIDDEN" | "INVALID_PROFILE") { super(code); }
}
export async function readFirmProfile(db: TenantTransaction): Promise<FirmProfile | null> {
 // Upgrade fixtures also render quotes against the supported predecessor schema.
 // No profile can exist there; preserve its issuer until this migration lands.
 if (!(await db.$client.query("SELECT to_regclass('app.firm_profile') IS NOT NULL present")).rows[0]?.present) return null;
 const row = (await db.$client.query(`SELECT trading_name, address_lines, contact_email, contact_phone
  FROM app.firm_profile WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND company_key=app.current_firm_profile_key()`)).rows[0];
 return row ? firmProfileV1.parse({ version: "firm-profile.v1", tradingName: row.trading_name,
  addressLines: row.address_lines, contactEmail: row.contact_email, contactPhone: row.contact_phone }) : null;
}
/** Snapshot only: callers persist the returned issuer in a new document version. */
export async function firmProfileIssuer(db: TenantTransaction, jobId?: string) {
 // Serialize issuer reads with saves, including the first profile insert.
 if ((await db.$client.query("SELECT to_regprocedure('app.current_firm_profile_key()') IS NOT NULL present")).rows[0]?.present) {
  const { key, tenant } = (await db.$client.query("SELECT app.current_firm_profile_key() key, current_setting('app.tenant_id',true) tenant")).rows[0];
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,949))", [`${tenant}:${key}`]);
 }
 let profile = await readFirmProfile(db);
 if (jobId && (await db.$client.query("SELECT to_regprocedure('app.job_saved_firm_name(uuid)') IS NOT NULL present")).rows[0]?.present) {
  const row = (await db.$client.query("SELECT app.job_saved_firm_name($1) name, app.current_firm_profile_key() company_key", [jobId])).rows[0];
  if (row.company_key?.startsWith("practice:") && row.name === null) profile = null;
  else if (profile && row.name !== null) profile = { ...profile, tradingName: row.name };
 }
 return { name: profile?.tradingName ?? "A Builder Ltd",
  address: profile?.addressLines.length ? profile.addressLines : (profile ? ["Address not provided"] : ["1 Trade Road", "London"]),
  email: profile?.contactEmail || "builder@example.invalid" };
}
export class FirmProfileRepository {
 constructor(private readonly pool: Pool) {}
 async read(context: VerifiedTenantContext) {
  return withTenant(this.pool, context, async db => {
   const row = (await db.$client.query(`SELECT role,app.current_firm_profile_key() company_key FROM app.membership
    WHERE tenant_id=app.current_tenant() AND id=app.current_actor() AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at>clock_timestamp())`)).rows[0];
   if (!row) throw new FirmProfileError("FORBIDDEN");
   return { version: "firm-profile-view.v1" as const, profile: await readFirmProfile(db), isPractice: row.company_key === null || row.company_key.startsWith("practice:"), canSave: row.company_key !== null && row.role === "owner" };
  });
 }
 async save(context: VerifiedTenantContext, raw: unknown) {
  const parsed = firmProfileV1.safeParse(raw);
  if (!parsed.success) throw new FirmProfileError("INVALID_PROFILE");
  const profile = parsed.data;
  await withTenant(this.pool, context, async db => {
   const actor = (await db.$client.query(`SELECT id,app.current_firm_profile_key() company_key FROM app.membership
    WHERE tenant_id=app.current_tenant() AND id=app.current_actor() AND role='owner'
     AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`)).rows[0];
   if (!actor?.company_key) throw new FirmProfileError("FORBIDDEN");
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,949))", [`${context.tenantId}:${actor.company_key}`]);
   await db.$client.query(`INSERT INTO app.firm_profile(tenant_id,company_key,trading_name,address_lines,contact_email,contact_phone)
    VALUES(app.current_tenant(),app.current_firm_profile_key(),$1,$2,$3,$4)
    ON CONFLICT(tenant_id,company_key) DO UPDATE SET trading_name=excluded.trading_name,
     address_lines=excluded.address_lines,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone`,
   [profile.tradingName, profile.addressLines, profile.contactEmail, profile.contactPhone]);
   await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.id}`,
    eventType: "firm_profile.saved", subjectType: "firm_profile", subjectRef: actor.company_key,
    payload: { hashes: { profile: createHash("sha256").update(JSON.stringify(profile)).digest("hex") }, classifications: { action: "operational" } } }]);
  });
  return this.read(context);
 }
}
