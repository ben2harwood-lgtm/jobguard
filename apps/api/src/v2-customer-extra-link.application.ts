import type { Pool } from "pg";
import { V2CustomerExtraLinkRepository, assertExtraLinkMode, extraLinkCreateV1 } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { VariationApplication } from "./variation/variation.application.js";

/** Anonymous links record claims only; builder approval stays on the existing path. */
export class V2CustomerExtraLinkApplication {
  private readonly repository: V2CustomerExtraLinkRepository;
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.repository = new V2CustomerExtraLinkRepository(pool);
    this.access = new PracticeAccess(pool, sessionId);
  }
  async list(jobId: string) {
    assertExtraLinkMode(); const auth = await this.access.job(jobId);
    return { links: await this.repository.list(auth.context, jobId),
      photos: await this.repository.availablePhotos(auth.context, jobId),
      variations: await new VariationApplication(this.pool, this.sessionId).get(jobId) };
  }
  async command(jobId: string, raw: unknown) {
    assertExtraLinkMode(); const auth = await this.access.job(jobId);
    if (extraLinkCreateV1.safeParse(raw).success)
      return this.repository.create(auth.context, jobId, auth.membershipId, raw);
    return this.repository.cancel(auth.context, jobId, auth.membershipId, raw);
  }
  async open(capability: string) {
    assertExtraLinkMode(); const view = await this.repository.open(capability);
    // A signed-in practice firm cannot use a different firm's customer capability.
    if (this.sessionId) await this.access.job(view.jobId);
    return view;
  }
  async agree(capability: string, raw: unknown) {
    await this.open(capability);
    return this.repository.agree(capability, raw);
  }
  async photo(capability: string, id: string) {
    await this.open(capability);
    return this.repository.photo(capability, id);
  }
}
