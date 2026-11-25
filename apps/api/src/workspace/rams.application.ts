import type { Pool } from "pg";
import { PracticeAccessError, RamsRepository, RamsError, WorkPlanRepository, ramsCommandV1,
  JobRepository, JobPartiesRepository, ramsWarning, ramsReadyToSign } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export class RamsApplication {
  private readonly access: PracticeAccess;
  private readonly plans: WorkPlanRepository;
  private readonly drafts: RamsRepository;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.plans = new WorkPlanRepository(pool);
    this.drafts = new RamsRepository(pool);
  }
  private async authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
  async read(jobId: string) {
    const { context, membershipId, digest } = await this.authorize(jobId);
    const job = await new JobRepository(this.pool).readWorkspace(context, ["job:view"], jobId);
    const parties = await new JobPartiesRepository(this.pool).view(context, membershipId, jobId, digest);
    const site = parties.current?.site;
    const address = site ? [...site.addressLines, site.town, site.postcode].filter(Boolean).join(", ") : "Site address not recorded";
    const plan = await this.plans.open(context, jobId);
    const drafts = await this.drafts.read(context, jobId);
    const latest = drafts.at(-1);
    return { canSign: !!latest && latest.status === "draft" && ramsReadyToSign(latest.sections), version: "rams-screen.v1" as const, environment: "synthetic_demo" as const, warning: ramsWarning,
      job: { title: job.title, address },
      plan: { quoteRevisionId: plan.quoteRevisionId, planVersion: plan.version }, drafts };
  }
  async command(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    const parsed = ramsCommandV1.safeParse(raw);
    if (!parsed.success) throw new RamsError("RAMS_INVALID_COMMAND");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    const plan = await this.plans.open(context, jobId);
    return this.drafts.command(context, jobId, this.sessionId, parsed.data, plan);
  }
}
export { RamsError };
export type RamsScreen = Awaited<ReturnType<RamsApplication["read"]>>;
