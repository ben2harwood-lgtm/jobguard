import type { Pool } from "pg";
import { ContractorError, ContractorPracticeSessionError, contractorPracticeSessionFailureV1, contractorPracticeSessionHttpStatus, contractorPracticeSessionRevokeV1, contractorPracticeSessionRevokedV1 } from "@jobguard/core";
import { ContractorPracticeSessionRepository, contractorSessionContext, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
export function assertContractorPracticeSessionMode(): void {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ContractorPracticeSessionError("MODE_FORBIDDEN");
}
export class ContractorPracticeSessionApplication {
 private readonly repository: ContractorPracticeSessionRepository;
 constructor(private readonly pool: Pool) { this.repository = new ContractorPracticeSessionRepository(pool); }
 async revoke(principal: unknown, raw: unknown) {
  try {
   assertContractorPracticeSessionMode();
   const parsed = workOrderPrincipalV1.safeParse(principal);
   if (!parsed.success) throw new ContractorPracticeSessionError("UNAUTHENTICATED");
   const sessionId = parsed.data.sessionId;
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   if (!contractorPracticeSessionRevokeV1.safeParse(raw).success) throw new ContractorPracticeSessionError("INVALID_COMMAND");
   return contractorPracticeSessionRevokedV1.parse(await this.repository.revoke(context, sessionId));
  } catch (error) {
   if (error instanceof ContractorPracticeSessionError) throw error;
   if (error instanceof ContractorError && (error.code === "UNAUTHENTICATED" || error.code === "MODE_FORBIDDEN")) throw new ContractorPracticeSessionError(error.code);
   throw new ContractorPracticeSessionError("PRACTICE_SESSION_UNAVAILABLE");
  }
 }
}
export function contractorPracticeSessionHttpFailure(error: unknown) {
 const code = error instanceof ContractorPracticeSessionError ? error.code : "PRACTICE_SESSION_UNAVAILABLE";
 return { status: contractorPracticeSessionHttpStatus(code), body: contractorPracticeSessionFailureV1.parse({ version: "contractor-practice-session-error.v1", code }) };
}
export const createContractorPracticeSessionApplication = ({ pool }: { pool: Pool }) => new ContractorPracticeSessionApplication(pool);
