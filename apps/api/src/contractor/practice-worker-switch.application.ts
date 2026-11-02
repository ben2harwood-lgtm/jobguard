import type { Pool } from "pg";
import { z } from "zod";
import { ContractorError, PracticeWorkerSwitchError, practiceWorkerSwitchOnV1, practiceWorkerSwitchOffV1, practiceWorkerSwitchStateV1, practiceWorkerSwitchFailureV1, practiceWorkerSwitchHttpStatus } from "@jobguard/core";
import { ContractorRepository, PracticeWorkerSwitchRepository, contractorSessionContext, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
export function assertPracticeWorkerSwitchMode() {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeWorkerSwitchError("MODE_FORBIDDEN");
}
function translated(error: unknown) {
 if (error instanceof PracticeWorkerSwitchError) return error;
 if (error instanceof ContractorError && (error.code === "UNAUTHENTICATED" || error.code === "MODE_FORBIDDEN")) return new PracticeWorkerSwitchError(error.code);
 return new PracticeWorkerSwitchError("SWITCH_UNAVAILABLE");
}
export class PracticeWorkerSwitchApplication {
 private readonly repository: PracticeWorkerSwitchRepository;
 constructor(private readonly pool: Pool) { this.repository = new PracticeWorkerSwitchRepository(pool); }
 async start(principal: unknown, workerId: unknown, raw: unknown) {
  try {
   assertPracticeWorkerSwitchMode();
   const parsed = workOrderPrincipalV1.safeParse(principal); if (!parsed.success) throw new PracticeWorkerSwitchError("UNAUTHENTICATED");
   const sessionId = parsed.data.sessionId;
   const actor = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const command = practiceWorkerSwitchOnV1.safeParse(raw); if (!command.success) throw new PracticeWorkerSwitchError("INVALID_COMMAND");
   const worker = z.guid({ error: "Invalid uuid" }).safeParse(workerId); if (!worker.success) throw new PracticeWorkerSwitchError("NOT_FOUND");
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   return practiceWorkerSwitchStateV1.parse(await this.repository.switchOn(context, actor, sessionId, { ...command.data, workerId: worker.data }));
  } catch (error) { throw translated(error); }
 }
 async end(principal: unknown, raw: unknown) {
  try {
   assertPracticeWorkerSwitchMode();
   const parsed = workOrderPrincipalV1.safeParse(principal); if (!parsed.success) throw new PracticeWorkerSwitchError("UNAUTHENTICATED");
   const sessionId = parsed.data.sessionId;
   const actor = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const command = practiceWorkerSwitchOffV1.safeParse(raw); if (!command.success) throw new PracticeWorkerSwitchError("INVALID_COMMAND");
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   return practiceWorkerSwitchStateV1.parse(await this.repository.switchOff(context, actor, sessionId, command.data));
  } catch (error) { throw translated(error); }
 }
 async read(principal: unknown) {
  try {
   assertPracticeWorkerSwitchMode();
   const parsed = workOrderPrincipalV1.safeParse(principal); if (!parsed.success) throw new PracticeWorkerSwitchError("UNAUTHENTICATED");
   const sessionId = parsed.data.sessionId;
   await new ContractorRepository(this.pool).resolveSession(sessionId);
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   return practiceWorkerSwitchStateV1.parse(await this.repository.state(context, sessionId));
  } catch (error) { throw translated(error); }
 }
}
export function practiceWorkerSwitchHttpFailure(error: unknown) {
 const failure = translated(error);
 return { status: practiceWorkerSwitchHttpStatus(failure.code), body: practiceWorkerSwitchFailureV1.parse({ version: "practice-worker-switch-error.v1", code: failure.code }) };
}
export const createPracticeWorkerSwitchApplication = ({ pool }: { pool: Pool }) => new PracticeWorkerSwitchApplication(pool);
