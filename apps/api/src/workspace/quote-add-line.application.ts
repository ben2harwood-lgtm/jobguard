import { PracticeAccessError, QuoteAddLineError, QuoteAddLineRepository, quoteAddLineCommandV1, type QuoteAddLineCommand,
  type QuoteAddLineReceipt } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { QuoteAddLineError, quoteAddLineCommandV1, type QuoteAddLineCommand, type QuoteAddLineReceipt };

/** V2-C6: the builder adds an unpriced line to a quote before it is sent. V2 only. */
export class QuoteAddLineApplication {
  private readonly access: PracticeAccess;
  private readonly lines: QuoteAddLineRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.lines = new QuoteAddLineRepository(pool);
  }

  async add(jobId: string, input: unknown): Promise<QuoteAddLineReceipt> {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    // The firm must see the job before the body is read.
    const { context } = await this.access.job(jobId);
    if (!quoteAddLineCommandV1.safeParse(input).success) throw new QuoteAddLineError("QUOTE_ADD_LINE_INVALID");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.lines.addLine(context, jobId, this.sessionId, input);
  }
}

const statuses: Record<QuoteAddLineError["code"], number> = {
  QUOTE_ADD_LINE_INVALID: 400, QUOTE_NOT_EDITABLE: 409, QUOTE_COMMAND_CONFLICT: 409, QUOTE_EDITOR_REQUIRED: 403,
};
/** The route's refusal for an add-line error: code and status only, never the line. */
export function quoteAddLineFailure(error: unknown): { status: number; code: string } | null {
  if (!(error instanceof QuoteAddLineError)) return null;
  return { status: statuses[error.code], code: error.code === "QUOTE_EDITOR_REQUIRED" ? "FORBIDDEN" : error.code };
}
