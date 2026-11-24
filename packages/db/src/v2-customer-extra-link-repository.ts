import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { z } from "zod";
import { V2FilesystemStorage, sha256 } from "@jobguard/storage";
import { appendAuditBatch } from "./audit.js";
import { captureV2Delivery } from "./v2-local-catcher.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid();
const common = { version: z.literal("v2-extra-link.v1"), commandId: uuid,
  expectedVersion: z.number().int().min(0).max(2), occurredAt: z.iso.datetime() };
export const extraLinkCreateV1 = z.strictObject({ ...common, action: z.literal("create"),
  variationId: uuid, revisionId: uuid, token: z.string().regex(/^[a-f0-9]{64}$/u),
  expiresAt: z.iso.datetime(), photoIds: z.array(uuid).max(12) });
export const extraLinkCancelV1 = z.strictObject({ ...common, action: z.literal("cancel"), linkId: uuid });
export const extraLinkAgreeV1 = z.strictObject({ ...common, action: z.literal("agree"),
  jobId: uuid, revisionId: uuid, amount: z.string().regex(/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/u),
  name: z.string().trim().min(1).max(120).refine(value => !/[\x00-\x1f]/u.test(value)) });
export function assertExtraLinkMode() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo")
    throw new Error("LINK_UNAVAILABLE");
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function extraLinkCapability(value: string) {
  const match = /^([a-f0-9]{64})\.([a-f0-9]{64})$/u.exec(value);
  if (!match) throw new Error("LINK_UNAVAILABLE");
  return { firm: match[1]!, tokenHash: digest(match[2]!) };
}
export function extraLinkAmount(pence: string) {
  const n = BigInt(pence), a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}
type Photo = { id: string; objectKey: string; objectVersionId: string; sha256: string; contentType: string };
type Link = { id: string; tenant_id: string; job_id: string; variation_id: string; revision_id: string;
  variation_version: number; amount: string; description: string; firm_digest: string; photos: Photo[];
  link_version: number; agreed_at: string | null; agreed_by: string | null; cancelled_at: string | null;
  actor_membership_id: string; create_fingerprint: string; cancel_command_id: string | null;
  cancel_fingerprint: string | null; replayed?: boolean };
// Deliberate customer allowlist. Internal notes, firm keys, token hashes and storage
// locators never leave the server. A typed name is a claim, not an authenticated identity.
export const extraLinkCustomerView = (l: Link) => ({ version: "v2-extra-link-view.v1" as const,
  environment: "synthetic_demo" as const, jobId: l.job_id, revisionId: l.revision_id,
  variationVersion: l.variation_version, amount: l.amount, description: l.description,
  photoIds: l.photos.map(p => p.id), expectedVersion: l.link_version, agreedAt: l.agreed_at });

async function audit(db: TenantTransaction, l: Pick<Link, "id" | "job_id" | "revision_id" | "actor_membership_id">,
  verb: "created" | "cancelled" | "agreed", commandId: string) {
  await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1",
    actorRef: `membership:${l.actor_membership_id}`, eventType: `v2.customer_extra_link.${verb}`,
    subjectType: "customer_extra_link", subjectRef: l.id,
    payload: { references: { commandId, jobId: l.job_id, revisionId: l.revision_id,
      ...(verb === "agreed" ? { attribution: "bearer_claim_recorded_for_issuer" } : {}) } } }]);
}

export class V2CustomerExtraLinkRepository {
  constructor(private readonly pool: Pool) {}
  async create(context: VerifiedTenantContext, jobId: string, actor: string, raw: unknown) {
    assertExtraLinkMode();
    const c = extraLinkCreateV1.parse(raw);
    const tokenHash = digest(c.token);
    const fingerprint = digest(JSON.stringify({ ...c, token: tokenHash }));
    const result = await withTenant(this.pool, context, async db => {
      const current = (await db.$client.query(`SELECT v.current_revision_id,v.state,r.revision,r.description,
        r.signed_delta_pence::text,r.content_hash,app.current_firm_profile_key() firm_key
        FROM app.variation v JOIN app.variation_revision r ON (r.tenant_id,r.variation_id,r.id)=(v.tenant_id,v.id,$4)
        JOIN app.job j ON (j.tenant_id,j.id)=(v.tenant_id,v.job_id)
        JOIN app.membership m ON m.tenant_id=v.tenant_id AND m.id=app.current_actor() AND m.id=$5 AND m.role IN('owner','admin')
        WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.id=$3 AND j.status='live' FOR UPDATE OF v`,
      [context.tenantId, jobId, c.variationId, c.revisionId, actor])).rows[0];
      if (!current) throw new Error("LINK_UNAVAILABLE");
      const prior = (await db.$client.query<Link>("SELECT * FROM app.v2_customer_extra_link WHERE tenant_id=$1 AND id=$2", [context.tenantId, c.commandId])).rows[0];
      const capability = `${digest(current.firm_key)}.${c.token}`;
      if (prior) {
        if (prior.create_fingerprint !== fingerprint || prior.job_id !== jobId) throw new Error("LINK_COMMAND_CONFLICT");
        return { linkId: prior.id, capability, replayed: true };
      }
      const expires = Date.parse(c.expiresAt);
      if (c.expectedVersion !== current.revision || c.revisionId !== current.current_revision_id || current.state !== "priced" ||
        expires <= Date.now() || expires > Date.now() + 30 * 86400_000) throw new Error("LINK_UNAVAILABLE");
      const photos = (await db.$client.query<Photo>(`SELECT id,object_key AS "objectKey",object_version_id AS "objectVersionId",
        sha256,content_type AS "contentType" FROM app.evidence_object e
        WHERE tenant_id=$1 AND job_id=$2 AND id=ANY($3::uuid[]) AND kind='original'
        AND content_type IN('image/jpeg','image/png','image/webp') AND server_verified_at IS NOT NULL
        AND NOT EXISTS(SELECT FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))`,
      [context.tenantId, jobId, c.photoIds])).rows;
      if (photos.length !== c.photoIds.length) throw new Error("LINK_UNAVAILABLE");
      const l = (await db.$client.query<Link>(`INSERT INTO app.v2_customer_extra_link
        (tenant_id,id,job_id,firm_key,firm_digest,variation_id,revision_id,variation_version,amount,content_hash,
         description,photos,token_hash,expires_at,actor_membership_id,create_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16) RETURNING *`,
      [context.tenantId, c.commandId, jobId, current.firm_key, digest(current.firm_key), c.variationId, c.revisionId,
        current.revision, extraLinkAmount(current.signed_delta_pence), current.content_hash, current.description,
        JSON.stringify(photos), tokenHash, c.expiresAt, actor, fingerprint])).rows[0]!;
      await audit(db, l, "created", c.commandId);
      return { linkId: l.id, capability, replayed: false };
    });
    // The catcher logs metadata only. Only the builder's local inbox gets the URL.
    if (!result.replayed) captureV2Delivery("customer_extra_link", "customer@jobguard-v2.invalid");
    return result;
  }
  async cancel(context: VerifiedTenantContext, jobId: string, actor: string, raw: unknown) {
    assertExtraLinkMode(); const c = extraLinkCancelV1.parse(raw), fingerprint = digest(JSON.stringify(c));
    return withTenant(this.pool, context, async db => {
      // Variation precedes link consistently with create and agree.
      await db.$client.query(`SELECT v.id FROM app.variation v JOIN app.v2_customer_extra_link l
        ON (l.tenant_id,l.variation_id)=(v.tenant_id,v.id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.id=$3 FOR UPDATE OF v`,
      [context.tenantId, jobId, c.linkId]);
      const l = (await db.$client.query<Link>(`SELECT l.* FROM app.v2_customer_extra_link l
        JOIN app.membership m ON m.tenant_id=l.tenant_id AND m.id=app.current_actor() AND m.id=$4 AND m.role IN('owner','admin')
        WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.id=$3 FOR UPDATE OF l`, [context.tenantId, jobId, c.linkId, actor])).rows[0];
      if (!l) throw new Error("LINK_UNAVAILABLE");
      if (l.cancel_command_id === c.commandId) {
        if (l.cancel_fingerprint !== fingerprint) throw new Error("LINK_COMMAND_CONFLICT");
        return { cancelled: true };
      }
      if (l.link_version !== c.expectedVersion || l.cancelled_at || l.agreed_at) throw new Error("LINK_UNAVAILABLE");
      await db.$client.query(`UPDATE app.v2_customer_extra_link SET cancelled_at=clock_timestamp(),link_version=2,
        cancel_command_id=$3,cancel_fingerprint=$4 WHERE tenant_id=$1 AND id=$2`, [context.tenantId, l.id, c.commandId, fingerprint]);
      await audit(db, { ...l, actor_membership_id: actor }, "cancelled", c.commandId);
      return { cancelled: true };
    });
  }
  async list(context: VerifiedTenantContext, jobId: string) {
    assertExtraLinkMode();
    return withTenant(this.pool, context, async db => (await db.$client.query(`SELECT id,variation_id AS "variationId",
      revision_id AS "revisionId",variation_version AS "variationVersion",amount,link_version AS "expectedVersion",
      agreed_at AS "agreedAt",agreed_by AS "agreedBy",cancelled_at AS "cancelledAt",expires_at AS "expiresAt"
      FROM app.v2_customer_extra_link WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at`, [context.tenantId, jobId])).rows);
  }
  async availablePhotos(context: VerifiedTenantContext, jobId: string) {
    assertExtraLinkMode();
    return withTenant(this.pool, context, async db => (await db.$client.query<{ id: string; receivedAt: Date }>(`
      SELECT e.id,e.server_received_at AS "receivedAt" FROM app.evidence_object e
      WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='original'
      AND e.content_type IN('image/png','image/jpeg','image/webp') AND e.server_verified_at IS NOT NULL
      AND NOT EXISTS(SELECT FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))
      ORDER BY e.server_received_at,e.id`, [context.tenantId, jobId])).rows);
  }
  async open(capability: string) {
    assertExtraLinkMode(); const c = extraLinkCapability(capability);
    return extraLinkCustomerView((await this.pool.query<{ result: Link }>("SELECT app.v2_f6_open($1,$2) result", [c.firm, c.tokenHash])).rows[0]!.result);
  }
  async agree(capability: string, raw: unknown) {
    assertExtraLinkMode(); const c = extraLinkAgreeV1.parse(raw), token = extraLinkCapability(capability);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const l = (await client.query<{ result: Link }>("SELECT app.v2_f6_agree($1,$2,$3,$4,$5,$6) result",
        [token.firm, token.tokenHash, c.commandId, digest(JSON.stringify(c)), c.name, c.expectedVersion])).rows[0]!.result;
      if (c.jobId !== l.job_id || c.revisionId !== l.revision_id || c.amount !== l.amount) throw new Error("LINK_UNAVAILABLE");
      if (!l.replayed) await audit(drizzle(client) as TenantTransaction, l, "agreed", c.commandId);
      await client.query("COMMIT");
      return extraLinkCustomerView(l);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async photo(capability: string, id: string) {
    assertExtraLinkMode(); const c = extraLinkCapability(capability);
    const l = (await this.pool.query<{ result: Link }>("SELECT app.v2_f6_open($1,$2) result", [c.firm, c.tokenHash])).rows[0]!.result;
    const p = l.photos.find(photo => photo.id === id);
    const storage = V2FilesystemStorage.fromEnvironment();
    if (!p) throw new Error("LINK_UNAVAILABLE");
    const saved = storage ? undefined : (await this.pool.query<{ result: { bytes: string; contentType: string } | null }>(
      "SELECT app.v2_f6_photo($1,$2,$3) result", [c.firm, c.tokenHash, id])).rows[0]?.result;
    if (!storage && !saved) throw new Error("LINK_UNAVAILABLE");
    const bytes = saved ? Buffer.from(saved.bytes, "base64") : undefined;
    const object = storage ? await storage.readExactVersion(p.objectKey, p.objectVersionId) : {
      key: p.objectKey, versionId: p.objectVersionId, bytes: bytes!, byteLength: bytes!.length, contentType: saved!.contentType };

    if (sha256(object.bytes) !== p.sha256 || object.contentType !== p.contentType) throw new Error("LINK_UNAVAILABLE");
    return object;
  }
}
