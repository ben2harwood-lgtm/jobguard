import { StockRepository, StockError, stockQueryV1, PracticeAccessError,
  type StockCommand, type StockQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { stockCommandV1, stockQueryV1, StockError, type StockCommand, type StockQuery, type StockView } from "@jobguard/db";

export class StockApplication {
  private readonly access: PracticeAccess;
  private readonly stock: StockRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.stock = new StockRepository(pool);
  }
  async read(jobId: string, query: StockQuery) {
    const { context } = await this.authorize(jobId);
    if (!stockQueryV1.safeParse(query).success) throw new StockError("STOCK_INVALID_QUERY");
    return this.stock.read(context, jobId);
  }
  async execute(jobId: string, command: StockCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.stock.execute(context, jobId, this.sessionId, command);
  }
  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
}
