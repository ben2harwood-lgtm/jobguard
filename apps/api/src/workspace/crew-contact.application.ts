import { CrewContactError, CrewContactRepository, PracticeAccessError, crewContactQueryV1, crewContactV1,
  type CrewContact, type CrewContactCommand } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { crewContactQueryV1, crewContactV1, type CrewContact, type CrewContactCommand };

/** V2-C3C: the signed-in practice firm's crew records. V2 only. */
export class CrewContactApplication {
  private readonly access: PracticeAccess;
  private readonly contacts: CrewContactRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.contacts = new CrewContactRepository(pool);
  }

  async list(query: unknown): Promise<CrewContact[]> {
    const { context } = await this.authorize();
    if (!crewContactQueryV1.safeParse(query).success) throw new CrewContactError("CREW_CONTACT_INVALID");
    return this.contacts.list(context);
  }

  async record(input: CrewContactCommand): Promise<CrewContact> {
    const { context } = await this.authorize();
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.contacts.record(context, this.sessionId, input);
  }

  private authorize() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.session();
  }
}
