import type { Pool } from "pg";
import { z } from "zod";
import { ContractorPartyRepository } from "@jobguard/db";
import { ContractorPartyError, contractorCustomerLinkV1 } from "@jobguard/core";
import { contractorPartiesPrincipalV1, contractorPartiesFailureV1 } from "./contractor-parties.contracts.js";
export class ContractorPartiesApplication {
  private readonly repository: ContractorPartyRepository;
  constructor(pool: Pool) { this.repository = new ContractorPartyRepository(pool); }
  private session(raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ContractorPartyError("MODE_FORBIDDEN");
    const parsed = contractorPartiesPrincipalV1.safeParse(raw);
    if (!parsed.success) throw new ContractorPartyError("UNAUTHENTICATED");
    return parsed.data.sessionId;
  }
  async linkCustomer(principal: unknown, clientId: string, raw: unknown) {
    const session = this.session(principal);
    if (!z.string().uuid().safeParse(clientId).success) throw new ContractorPartyError("NOT_FOUND");
    const parsed = contractorCustomerLinkV1.safeParse(raw);
    if (!parsed.success) throw new ContractorPartyError("INVALID_COMMAND");
    return this.repository.linkCustomer(await this.repository.resolveSession(session), clientId, parsed.data);
  }
  async readResident(principal: unknown, jobId: string) {
    const session = this.session(principal);
    if (!z.string().uuid().safeParse(jobId).success) throw new ContractorPartyError("NOT_FOUND");
    return this.repository.readResident(await this.repository.resolveSession(session), jobId);
  }
}
export const createContractorPartiesApplication = (dependencies: { pool: Pool }) => new ContractorPartiesApplication(dependencies.pool);
export function contractorPartiesHttpFailure(error: unknown) {
  const code = error instanceof ContractorPartyError ? error.code : "DATABASE_UNAVAILABLE";
  const status = code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "MODE_FORBIDDEN" ? 403 : ["COMMAND_CONFLICT", "STALE_REVISION"].includes(code) ? 409 : code === "DATABASE_UNAVAILABLE" ? 503 : 422;
  return { status, body: contractorPartiesFailureV1.parse({ version: "contractor-parties-error.v1", code, recoverable: status === 503 }) };
}
