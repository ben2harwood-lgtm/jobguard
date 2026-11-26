// V2-G1 (Q53): the snag register. Same mode and access checks as SnagApplication; answers with the whole register.
import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError, SnagError, buildSnagListV1, type SnagListItem } from "@jobguard/core";
import { SnagRegisterError, SnagRegisterRepository, SnagRepository, WatchdogError, practiceMaterialPool,
  type SnagRegisterEntry } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";
import { snagFailure } from "../snag.application.js";

export { SnagRegisterError, snagAgreedCommandV1, snagOwnerCommandV1, snagRegisterEventCommandV1, type SnagRegisterEntry,
  type SnagRegisterPersonView } from "@jobguard/db";

export type SnagRegister = { version: "v2-snag-register.v1"; environment: "synthetic_demo"; jobId: string; asOf: string;
  counts: Record<"open" | "fixed" | "checked" | "overdue" | "agreed", number>;
  crew: { crewId: string; name: string; trade: string }[];
  snags: (SnagListItem & SnagRegisterEntry)[]; realExternalActions: 0 };

export class SnagRegisterApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, sessionId?: string, private readonly clock: () => Date = () => new Date()) {
    this.assertMode(); this.access = new PracticeAccess(pool, sessionId);
  }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  private async open(jobId: string) {
    this.assertMode();
    const auth = await this.access.job(jobId), pool = practiceMaterialPool(this.pool, auth.digest);
    return { auth, snags: new SnagRepository(pool), register: new SnagRegisterRepository(pool) };
  }
  async read(jobId: string): Promise<SnagRegister> {
    const { auth, snags, register } = await this.open(jobId);
    const list = buildSnagListV1(jobId, this.clock(), await snags.read(auth.context, jobId));
    const entries = await register.read(auth.context, jobId);
    const rows = list.snags.map(snag => ({ ...snag, ...(entries[snag.id] ?? { owner: null, people: {}, agreed: null }) }));
    return { version: "v2-snag-register.v1", environment: "synthetic_demo", jobId, asOf: list.asOf,
      counts: { ...list.counts, agreed: rows.filter(row => row.agreed && row.state !== "checked").length },
      crew: await register.crewList(auth.context), snags: rows, realExternalActions: 0 };
  }
  /** Owner, event (with the person) or agreed mark, by `version`; then the whole register. */
  async command(jobId: string, raw: unknown): Promise<SnagRegister> {
    const { auth, register } = await this.open(jobId);
    const version = (raw as { version?: unknown } | null)?.version;
    if (version === "v2-snag-owner-command.v1") await register.setOwner(auth.context, jobId, auth.membershipId, raw);
    else if (version === "v2-snag-event-command.v1") await register.recordEvent(auth.context, jobId, auth.membershipId, raw);
    else if (version === "v2-snag-agreed-command.v1") await register.setAgreed(auth.context, jobId, auth.membershipId, raw);
    else throw new SnagRegisterError("V2_SNAG_INVALID_COMMAND");
    return this.read(jobId);
  }
}

const statuses: Record<SnagRegisterError["code"], number> = { V2_SNAG_INVALID_COMMAND: 400, V2_SNAG_CHECKER_IS_FIXER: 409,
  V2_SNAG_COMMAND_CONFLICT: 409, V2_SNAG_CREW_UNAVAILABLE: 409, V2_SNAG_NOT_FOUND: 404, V2_SNAG_NOTHING_OUTSTANDING: 409 };
/** This register's refusals, then main's snag refusals; null falls back to the job-source mapping. */
export function snagRegisterFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof SnagRegisterError) return { status: statuses[error.code], body: { code: error.code, environment: "synthetic_demo" } };
  if (error instanceof SnagError || error instanceof WatchdogError) return snagFailure(error);
  return null;
}
