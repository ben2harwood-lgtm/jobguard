import { FactReplyRepository, PracticeAccessError, type FactReplyCommand } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { FactReplyError, factReplyCommandV1, factReplyLinkV1, type FactReplyCommand, type FactReplyReceipt,
  type FactReplyView, type ReplyLinkView } from "@jobguard/db";

// V2 practice only. Builder commands need the signed-in practice session; the
// reply link needs only its token and reaches one question.
export class FactReplyApplication {
  private readonly access: PracticeAccess;
  private readonly replies: FactReplyRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.replies = new FactReplyRepository(pool);
  }

  async read(jobId: string) {
    const { context } = await this.authorize(jobId);
    return this.replies.read(context, jobId);
  }

  async command(jobId: string, command: FactReplyCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.replies.command(context, jobId, this.sessionId, command);
  }

  async open(token: string) {
    this.v2Only();
    return this.replies.open(token);
  }

  async receive(token: string, input: unknown) {
    this.v2Only();
    return this.replies.receive(token, input);
  }

  private v2Only() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
  }

  private authorize(jobId: string) {
    this.v2Only();
    return this.access.job(jobId);
  }
}
