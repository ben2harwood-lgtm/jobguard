import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { jobSourceTextV1, parsePoundsToPence, type Observation } from "@jobguard/core";
import type { FinalCheckManifest } from "./final-check-repository.js";
import { decodeJobSourceFixture } from "./job-source-fixtures.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

type Proposal = Pick<Observation, "text" | "facts" | "citations">;
export type TypedTextResult = { status: "invalid" } | { status: "readable" } | { status: "proposal"; proposal: Proposal };

/** A deliberately small practice grammar, not a trade/language or D13 classifier.
 * Whole-input matching prevents unexamined trailing assertions becoming safe facts.
 * Reviewed fixtures (including must-surface fixtures) always take precedence. */
export function decodeFinalCheckTypedText(text: string, reference: string | null, kind: "note_or_voice" | "customer_request"): TypedTextResult {
  if (!jobSourceTextV1.safeParse(text).success) return { status: "invalid" };
  const fixture = decodeJobSourceFixture(reference, text, kind);
  if (fixture) return { status: "proposal", proposal: fixture };
  if (reference !== null) return { status: "invalid" };
  const normalized = text.toLowerCase().trim();
  // Estimates are separate sentences, never approved prices. Reject an entire
  // malformed/ambiguous estimate rather than extracting a convenient substring.
  const parts = normalized.split(/\s+estimated extra\s*:?\s*/u);
  const work = parts.shift()!;
  const estimates: number[] = [];
  let unknownEstimate = false;
  for (const part of parts) {
    // Only amount/unit ambiguity is accepted as an unknown estimate. An extra
    // sentence or instruction stays outside the grammar, including safety/legal
    // assertions; never discard that text and manufacture negative D13 facts.
    if (!/^(?:[£0-9.,+\-!?\s]|\b(?:pounds|quid|hours|or|and)\b)+$/u.test(part.trim())) return { status: "readable" };
    const match = /^(?:£\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s+(?:pounds|quid))[.!?]*$/u.exec(part.trim());
    try {
      if (!match) unknownEstimate = true;
      else estimates.push(parsePoundsToPence(match[1] ?? match[2]!));
    } catch { unknownEstimate = true; }
  }
  const match = /^(?:(?:please|can you)\s+)?(?:i\s+)?(?:also\s+)?(paint(?:ed)?|fit(?:ted)?|install(?:ed)?)\s+(?:(?:the|a|an)\s+)?((?:(?:hallway|kitchen|bedroom|bathroom|living room|outside|loft)\s+)?(?:ceiling|walls?|door|tap|hatch|shel(?:f|ves)|cupboard|skirting))(?:\s+as an extra)?(?:\s*[,;]\s*customer (?:asked|requested)(?: for it)?|\s+as (?:asked|requested)(?: by (?:the )?customer)?)?[.!?]*$/u.exec(work.trim());
  if (!match) return { status: "readable" };
  const completed = ["painted", "fitted", "installed"].includes(match[1]!);
  if (!completed && kind !== "customer_request") return { status: "readable" };
  const action = match[1]!.startsWith("paint") ? "paint" : "fit";
  const description = match[2]!;
  // Legacy hallway fixtures use this reference. Other actions stay distinct.
  const workReference = action === "paint" && description === "hallway ceiling" ? "practice:hallway-ceiling" : `practice:typed:${action}:${description}`;
  return { status: "proposal", proposal: { text, citations: [{ start: 0, end: text.length, quote: text }], facts: {
    workReference, scopeArea: "job", description, status: completed ? "completed" : "requested",
    estimatedValuePence: !unknownEstimate && estimates.length && new Set(estimates).size === 1 ? estimates[0]! : null,
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
    return decodeFinalCheckTypedText(text, row.synthetic_fixture_ref, s.sourceKind === "job_diary_text" ? "note_or_voice" : "customer_request");
  });
}
