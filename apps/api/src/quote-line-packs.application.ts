import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError, calculateMaterialPackCount } from "@jobguard/core";
import { PracticeAccessError, QuoteLinePackRepository, QuoteRepository } from "@jobguard/db";
import { z } from "zod";
import { PracticeAccess } from "./practice-access.js";

const value = z.string().max(40);
/** Query strings only; their content is judged by the core pack count, which answers with a needs_input reason. */
export const quoteLinePacksQueryV1 = z.object({ packSize: value.optional(), packUnit: value.optional(), wastage: value.optional(), onSite: value.optional() }).strict();
const lineIdV1 = z.guid();
const WHOLE_PACKS = /^(0|[1-9]\d{0,8})$/u;

type PackCountResult = ReturnType<typeof calculateMaterialPackCount>;
export type PackCountNeedsInputReason = Extract<PackCountResult, { status: "needs_input" }>["reason"];
export type PackCountV1 = {
  version: "pack-count.v1"; environment: "synthetic_demo"; realExternalActions: 0; jobId: string; lineId: string;
  line: { quantity: string | null; unit: string | null; confirmed: boolean };
  /** No pack size or stock is stored yet; every count is worked out from the query. */
  packSizeSaved: false;
} & ({ status: "calculated"; grossPacks: string; packsOnSiteUsed: string; packsToOrder: string } | { status: "needs_input"; reason: PackCountNeedsInputReason });

/**
 * QW-6: how many packs a quote line needs, how many on-site packs it uses and how many to order.
 * Practice mode only and read only. The line's quantity counts as confirmed only on an issued or accepted quote.
 */
export class QuoteLinePacksApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, sessionId?: string) { this.assertMode(); this.access = new PracticeAccess(pool, sessionId); }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  async read(jobId: string, lineId: string, query: unknown = {}): Promise<PackCountV1> {
    this.assertMode();
    const parsed = quoteLinePacksQueryV1.safeParse(query);
    if (!parsed.success) throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
    const auth = await this.access.job(jobId);
    if (!lineIdV1.safeParse(lineId).success) throw new PracticeAccessError("NOT_FOUND");
    const workspace = await new QuoteRepository(this.pool).readWorkspace(auth.context, jobId);
    const revision = workspace.revisions.find(r => r.lines.some((l: { id: string }) => l.id === lineId));
    const line = revision?.lines.find((l: { id: string }) => l.id === lineId) as { quantity: string | null; unit: string | null; included: boolean } | undefined;
    if (!revision || !line) throw new PracticeAccessError("NOT_FOUND");
    // An excluded line is not part of what the customer agreed, so its quantity is never confirmed.
    const confirmed = line.included === true && await new QuoteLinePackRepository(this.pool).revisionConfirmed(auth.context, jobId, revision.id);
    const { packSize, packUnit, wastage, onSite } = parsed.data;
    const result = calculateMaterialPackCount({
      measurement: { quantity: line.quantity ?? "", unit: line.unit ?? "", confirmed },
      wastageMultiplier: wastage ?? null,
      product: packSize === undefined && packUnit === undefined ? null : { packSize: { quantity: packSize ?? "", unit: packUnit ?? "" } },
      // Nothing on site unless the builder says so; anything other than a whole number of packs is refused by the core.
      confirmedUsablePacksSetAside: onSite === undefined ? 0n : WHOLE_PACKS.test(onSite) ? BigInt(onSite) : -1n,
    });
    const base = { version: "pack-count.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, lineId, line: { quantity: line.quantity, unit: line.unit, confirmed }, packSizeSaved: false } as const;
    return result.status === "calculated"
      ? { ...base, status: "calculated", grossPacks: result.grossPacks.toString(), packsOnSiteUsed: result.setAsidePacksUsed.toString(), packsToOrder: result.neededPacks.toString() }
      : { ...base, status: "needs_input", reason: result.reason };
  }
}
