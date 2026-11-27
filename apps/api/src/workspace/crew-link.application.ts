// V2-F7M (Q52): builder issues and cancels crew links; the crew page opens one and records presses.
import { CrewLinkRepository, PracticeAccessError } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { CrewLinkError, crewLinkCommandV1, crewLinkPressV1, crewLinkTokenHash, type CrewLinkCommand, type CrewLinkPress,
  type CrewLinkRow, type CrewLinkView, type CrewLinkTask, type CrewPress } from "@jobguard/db";

const v2Only = () => {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
    throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  }
};

export class CrewLinkApplication {
  private readonly access: PracticeAccess;
  private readonly links: CrewLinkRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.links = new CrewLinkRepository(pool);
  }
  async read(jobId: string) {
    v2Only();
    const { context } = await this.access.job(jobId);
    return { version: "v2-crew-links-view.v1" as const, crew: await this.links.crew(context),
      links: await this.links.list(context, jobId), presses: await this.links.crewPresses(context, jobId) };
  }
  async command(jobId: string, raw: unknown) {
    v2Only();
    const { context } = await this.access.job(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.links.command(context, jobId, this.sessionId, raw);
  }
}

/** The no-sign-in side: no practice session, the token alone opens one scope. */
export class CrewLinkPageApplication {
  private readonly links: CrewLinkRepository;
  constructor(pool: Pool) { this.links = new CrewLinkRepository(pool); }
  open(token: string) { v2Only(); return this.links.open(token); }
  receive(raw: unknown) { v2Only(); return this.links.receive(raw); }
}
