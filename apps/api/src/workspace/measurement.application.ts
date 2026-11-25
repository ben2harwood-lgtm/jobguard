import { calculateMaterialPackCount } from "@jobguard/core";
import { MeasurementError, MeasurementRepository, PracticeAccessError, measurementQueryV1,
  type MeasurementCommand, type MeasurementQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { MeasurementError, measurementCommandV1, measurementQueryV1,
  type Measurement, type MeasurementCommand, type MeasurementQuery } from "@jobguard/db";

type PackInputs = Omit<Parameters<typeof calculateMaterialPackCount>[0], "measurement">;

export class MeasurementApplication {
  private readonly access: PracticeAccess;
  private readonly measurements: MeasurementRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.measurements = new MeasurementRepository(pool);
  }

  async read(jobId: string, query: MeasurementQuery) {
    const { context } = await this.authorize(jobId);
    const parsed = measurementQueryV1.safeParse(query);
    if (!parsed.success) throw new MeasurementError("MEASUREMENT_INVALID_QUERY");
    const items = await this.measurements.read(context, jobId, parsed.data.scopeItemId);
    if (parsed.data.scopeItemId && items.length === 0) throw new PracticeAccessError("NOT_FOUND");
    return items;
  }

  async save(jobId: string, command: MeasurementCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.measurements.save(context, jobId, this.sessionId, command);
  }

  async calculatePacks(jobId: string, scopeItemId: string, inputs: PackInputs) {
    const [item] = await this.read(jobId, { version: "v2-measurement-query.v1", scopeItemId });
    return { scopeItemId: item!.scopeItemId,
      ...calculateMaterialPackCount({ ...inputs, measurement: item!.measurement }) };
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
