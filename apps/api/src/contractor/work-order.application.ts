import type { Pool } from "pg";
import { z } from "zod";
import { SorRepository, WorkOrderRepository, generateWorkOrderSample, prepareWorkOrderDemo, workOrderFailure } from "@jobguard/db";
import { WorkOrderError, workOrderFailureV1, workOrderHttpStatus, workOrderImportRequestV1, type WorkOrderImportRequest } from "@jobguard/core";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";

/**
 * ENT-2 work-order and schedule-of-rates services: server-only composition used by both the Nest controllers and the Next routes.
 * Tenant, membership and role come from the persisted contractor session; the request carries none of them.
 */
export class WorkOrderApplication {
  private readonly orders: WorkOrderRepository;
  private readonly rates: SorRepository;
  constructor(private readonly pool: Pool) { this.orders = new WorkOrderRepository(pool); this.rates = new SorRepository(pool); }
  private async member(raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new WorkOrderError("MODE_FORBIDDEN");
    const parsed = workOrderPrincipalV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("UNAUTHENTICATED");
    try { return await this.orders.resolveSession(parsed.data.sessionId); } catch (error) { throw workOrderFailure(error); }
  }
  /** The office register: recent import batches, the orders and the selectable generated files. */
  async overview(principal: unknown) { return this.orders.overview(await this.member(principal)); }
  /**
   * The screen/HTTP import (Q8): only a generated file can be imported in synthetic_demo - no arbitrary upload. The file is generated for
   * the caller's own demo organisation (created through the existing ENT-1 / CH-3b commands on first use) and imported as ordinary CSV.
   */
  async importGenerated(principal: unknown, raw: unknown) {
    const parsed = workOrderImportRequestV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("INVALID_COMMAND");
    if (parsed.data.source.kind !== "generated") throw new WorkOrderError("UPLOAD_NOT_ALLOWED");
    const member = await this.member(principal);
    const sample = parsed.data.source.sample;
    try {
      const demo = await prepareWorkOrderDemo(this.pool, member);
      return await this.orders.importCsv(member, { commandId: parsed.data.commandId, name: `generated: ${sample}`, kind: "generated", csv: generateWorkOrderSample(sample, demo) });
    } catch (error) { throw workOrderFailure(error); }
  }
  /** The same service for the later API (B1): a caller-supplied CSV. Not wired to any route while uploads are disallowed. */
  async importFile(principal: unknown, request: WorkOrderImportRequest) {
    const parsed = workOrderImportRequestV1.safeParse(request);
    if (!parsed.success || parsed.data.source.kind !== "csv") throw new WorkOrderError("INVALID_COMMAND");
    return this.orders.importCsv(await this.member(principal), { commandId: parsed.data.commandId, name: parsed.data.source.name, kind: "csv", csv: parsed.data.source.csv });
  }
  async batch(principal: unknown, batchId: string) { return this.orders.batch(await this.member(principal), batchId); }
  async revisions(principal: unknown, workOrderId: string) { return this.orders.revisions(await this.member(principal), workOrderId); }
  async importSorVersion(principal: unknown, raw: unknown) { return this.rates.importVersion(await this.member(principal), raw); }
  async sorVersions(principal: unknown) { return this.rates.list(await this.member(principal)); }
}
export const createWorkOrderApplication = (dependencies: { pool: Pool }) => new WorkOrderApplication(dependencies.pool);
export function workOrderHttpFailure(error: unknown) {
  const failure = workOrderFailure(error);
  const status = workOrderHttpStatus(failure.code);
  return { status, body: workOrderFailureV1.parse({ version: "work-order-error.v1", code: failure.code, recoverable: status === 503 }) };
}
export const workOrderIdSchema = z.string().uuid();
