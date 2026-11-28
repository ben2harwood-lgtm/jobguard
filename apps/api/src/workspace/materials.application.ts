import { MaterialsEnquiryRepository, MaterialsError, PracticeAccessError, materialsQueryV1,
  type MaterialEnquiryCommand, type MaterialLineCommand, type MaterialsQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { MaterialsError, materialEnquiryCommandV1, materialLineCommandV1, materialsQueryV1,
  type MaterialEnquiryCommand, type MaterialLineCommand, type MaterialsQuery, type MaterialsView } from "@jobguard/db";

// Internal draft only: an enquiry is a question to a merchant, never an order, and nothing here sends it.
export class MaterialsApplication {
  private readonly access: PracticeAccess;
  private readonly materials: MaterialsEnquiryRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.materials = new MaterialsEnquiryRepository(pool);
  }

  async read(jobId: string, query: MaterialsQuery) {
    const { context } = await this.authorize(jobId);
    if (!materialsQueryV1.safeParse(query).success) throw new MaterialsError("MATERIALS_INVALID_QUERY");
    return this.materials.read(context, jobId);
  }

  async saveLine(jobId: string, command: MaterialLineCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.materials.saveLine(context, jobId, this.sessionId, command);
  }

  async generate(jobId: string, command: MaterialEnquiryCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.materials.generate(context, jobId, this.sessionId, command);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
