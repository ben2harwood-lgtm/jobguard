import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { jobSourceTextV1, parsePoundsToPence, type Observation } from "@jobguard/core";
import type { FinalCheckManifest } from "./final-check-repository.js";
import { decodeJobSourceFixture } from "./job-source-fixtures.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

type Proposal = Pick<Observation, "text" | "facts" | "citations">;
export type TypedTextResult = { status: "invalid" } | { status: "readable" } | { status: "proposal"; proposal: Proposal; ambiguousPrice?: boolean };

/** A deliberately small practice grammar, not a trade/language or D13 classifier.
 * Whole-input matching prevents unexamined trailing assertions becoming safe facts.
 * Reviewed fixtures (including must-surface fixtures) always take precedence. */
export function decodeFinalCheckTypedText(text: string, reference: string | null, kind: "note_or_voice" | "customer_request"): TypedTextResult {
  if (!jobSourceTextV1.safeParse(text).success) return { status: "invalid" };
  const fixture = decodeJobSourceFixture(reference, text, kind);
  if (fixture) return { status: "proposal", proposal: fixture };
  if (reference !== null) return { status: "invalid" };
  const normalized = text.toLowerCase().trim();
  // Grammar (all rows consume the whole statement; articles and terminal punctuation are optional):
  // legacy       [please|can you] [I] [also] ACTION ITEM [as an extra] [customer asked/requested]
  // extra noun   extra|additional|added ITEM [Fitted|Installed it today]
  // extra action ACTION ITEM as an extra|as well|on top
  // site diary   Customer asked for an extra ITEM while we were on site. [PRICE.] COMPLETED it today.
  // message      [Hi, yes] please go ahead and ACTION ITEM as well. [PRICE.] [Thanks.]
  // PRICE        Agreed MONEY | MONEY is fine | Estimated extra: MONEY | attached MONEY
  // MONEY        £decimal | decimal pounds|quid; ambiguity is retained as an unknown estimate.
  const item = "(?:(?:hallway|kitchen|bedroom|bathroom|living room|outside|loft)\\s+)?(?:heated towel rail|towel rail|ceiling|walls?|door|tap|hatch|shel(?:f|ves)|cupboard|skirting)";
  const articleItem = `(?:(?:the|a|an)\\s+)?(${item})`;
  const actionPattern = "(paint(?:ed)?|fit(?:ted)?|install(?:ed)?)";
  // Only this bounded alphabet may occupy a price slot. It cannot swallow a
  // safety, dispute, legal or negation clause. Money is counted across all slots.
  const priceBody = "(?:[£0-9.,+\\-!?\\s]|\\b(?:pounds|quid|hours|or|and)\\b)+";
  const priceSentence = new RegExp(`(?:^|[.!,;]\\s*|\\s+)(?:agreed\\s+(${priceBody})|estimated extra\\s*:?\\s*(${priceBody})|(${priceBody})\\s+is fine)(?=[.!?]*(?:\\s|$))`, "gu");
  const prices: string[] = [];
  let work = normalized.replace(priceSentence, (_all, agreed: string, estimated: string, fine: string) => {
    prices.push((agreed ?? estimated ?? fine).trim()); return ". ";
  }).trim();
  // Directly attached amounts are allowed only at the end of the work clause.
  const attached = new RegExp(`\\s+(?:for\\s+)?(${priceBody})$`, "u").exec(work);
  if (attached && /£|\b(?:pounds|quid)\b/u.test(attached[1]!)) {
    prices.push(attached[1]!.trim()); work = work.slice(0, attached.index).trim();
  }
  work = work.replace(/(?:[.!?]\s*)+/gu, ". ").replace(/(?:[.!?]\s*)+$/u, "");
  const legacy = new RegExp(`^(?:(?:please|can you)\\s+)?(?:i\\s+)?(?:also\\s+)?${actionPattern}\\s+${articleItem}(?:\\s+as an extra)?(?:\\s*[,;]\\s*customer (?:asked|requested)(?: for it)?|\\s+as (?:asked|requested)(?: by (?:the )?customer)?)?$`, "u").exec(work);
  const extraAction = new RegExp(`^(?:(?:hi,? yes[, ]+)?please go ahead and\\s+)?${actionPattern}\\s+${articleItem}\\s+(?:as an extra|as well|on top)(?:[.!?]\\s*)?(?:thanks)?$`, "u").exec(work);
  const site = new RegExp(`^customer asked for an extra\\s+${articleItem} while we were on site(?:[.!?]\\s*(painted|fitted|installed) it today)?$`, "u").exec(work);
  const noun = new RegExp(`^(?:extra|additional|added)\\s+${articleItem}(?:[.!?]\\s*(painted|fitted|installed) it today)?$`, "u").exec(work);
  const match = extraAction ?? legacy;
  const verb = match?.[1] ?? site?.[2] ?? noun?.[2];
  const description = match?.[2] ?? site?.[1] ?? noun?.[1];
  if (!description || (description.includes("towel rail") && legacy !== null && match === legacy && !/\bas an extra\b/u.test(work))) return { status: "readable" };
  const completed = ["painted", "fitted", "installed"].includes(verb ?? "");
  if (!completed && kind !== "customer_request") return { status: "readable" };
  const action = verb?.startsWith("paint") ? "paint" : "fit";
  let estimatedValuePence: number | null = null;
  // An entire price slot must be exactly one money token. Two equal amounts are
  // still ambiguous; dates, durations and numbers without currency never qualify.
  if (prices.length === 1) {
    const money = /^(?:£\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s+(?:pounds|quid))[.!?]*$/u.exec(prices[0]!);
    if (money) try { estimatedValuePence = parsePoundsToPence(money[1] ?? money[2]!); } catch { /* bounded unknown */ }
  }
  // Legacy hallway fixtures use this reference. Other actions stay distinct.
  const workReference = action === "paint" && description === "hallway ceiling" ? "practice:hallway-ceiling" : `practice:typed:${action}:${description}`;
  return { status: "proposal", ambiguousPrice: prices.length > 0 && estimatedValuePence === null, proposal: { text, citations: [{ start: 0, end: text.length, quote: text }], facts: {
    workReference, scopeArea: "job", description, status: completed ? "completed" : "requested",
    estimatedValuePence,
    safetyImplication: false, customerClearlyRequested: !completed, needsPriorWrittenAgreement: false, significantWork: null,
    activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false,
  } } };
}

/** Runtime-only SELECTs: exact current original + intake + verified upload and
 * frozen evidence row. No hidden-table grant or caller-created evidence identity. */
export async function readFinalCheckTypedText(pool: Pool, context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number]): Promise<TypedTextResult> {
  if (m.comparisons.tenantId !== context.tenantId || !s.processable || !s.evidenceId || s.sourceRef !== s.evidenceId ||
    !["job_diary_text", "customer_message_text"].includes(s.sourceKind)) return { status: "invalid" };
  return withTenant(pool, context, async db => {
    const row = (await db.$client.query<{ bytes: Buffer; byte_length: number; sha256: string; synthetic_fixture_ref: string | null }>(`
      SELECT o.bytes,o.byte_length,o.sha256,o.synthetic_fixture_ref FROM app.job_source_original o
      JOIN (SELECT tenant_id,job_id,id,source_kind,evidence_id,object_version_id,sha256,source_received_at FROM app.job_diary_entry
        UNION ALL SELECT tenant_id,job_id,id,source_kind,evidence_id,object_version_id,sha256,source_received_at FROM app.customer_message_source) src
        ON(src.tenant_id,src.job_id,src.source_kind,src.id,src.evidence_id,src.object_version_id,src.sha256,src.source_received_at)
         =(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)
      JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256,e.server_received_at)
         =(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)
      JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
      JOIN app.job j ON(j.tenant_id,j.id)=(o.tenant_id,o.job_id)
      JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
      WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.evidence_id=$3 AND e.evidence_type=$4
        AND o.object_version_id=$5 AND o.sha256=$6 AND o.source_received_at=$7::timestamptz
        AND o.source_received_at<=$8::timestamptz AND to_jsonb(e)=$9::jsonb
        AND o.source_kind=CASE WHEN $4='job_diary_text' THEN 'diary' ELSE 'customer_message' END
        AND o.environment='synthetic_demo' AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'
        AND current_database()='jobguard_synthetic_demo' AND j.provenance<>'imported'
        AND EXISTS(SELECT 1 FROM app.authenticate_practice_session(j.practice_session_digest::text,j.tenant_id))
        AND e.kind='original' AND e.scope_item_id IS NULL AND e.server_verified_at IS NOT NULL
        AND e.object_key=o.object_key AND e.content_type=o.content_type AND e.byte_length=o.byte_length
        AND u.state='verified' AND u.server_verified_at IS NOT NULL AND u.scope_item_id IS NULL
        AND u.object_version_id=o.object_version_id AND u.object_key=o.object_key AND u.expected_sha256=o.sha256
        AND u.expected_content_type=o.content_type AND u.server_received_at=o.source_received_at
        AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)`,
    [context.tenantId, m.comparisons.jobId, s.evidenceId, s.sourceKind, s.objectVersionId, s.sha256, s.receivedAt, m.cutoff, JSON.stringify(s.input)])).rows[0];
    if (!row || !Buffer.isBuffer(row.bytes) || row.bytes.length !== Number(row.byte_length) ||
      createHash("sha256").update(row.bytes).digest("hex") !== row.sha256) return { status: "invalid" };
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(row.bytes); } catch { return { status: "invalid" }; }
    if (!Buffer.from(text, "utf8").equals(row.bytes)) return { status: "invalid" };
    const result = decodeFinalCheckTypedText(text, row.synthetic_fixture_ref, s.sourceKind === "job_diary_text" ? "note_or_voice" : "customer_request");
    // Unsupported extra-bearing originals remain pending, including unsafe
    // trailing clauses. Readability alone is not evidence of commercial absence.
    return result.status === "readable" && /\b(extra|additional|added|as well|on top)\b/iu.test(text) ? { status: "invalid" } : result;
  });
}
