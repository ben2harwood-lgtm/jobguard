import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";

export const contractorRoles = ["owner", "admin", "operative", "supervisor", "surveyor", "commercial_manager", "finance", "read_only", "client_approver"] as const;
export type ContractorRole = typeof contractorRoles[number];
export const contractorPermissions = ["organisation.read", "organisation.manage", "client.invite", "contract.read", "contract.manage", "job.read", "extra.log", "extra.price", "extra.approve", "data.export", "data.import", "statement.read", "dashboard.read", "resident.read"] as const;
export type ContractorPermission = typeof contractorPermissions[number];
export const contractorPermissionMatrix: Record<ContractorRole, readonly ContractorPermission[]> = {
  owner: ["organisation.read", "organisation.manage", "client.invite", "contract.read", "contract.manage"],
  admin: ["organisation.read", "organisation.manage", "client.invite", "contract.read", "contract.manage"],
  operative: ["job.read", "extra.log", "resident.read"],
  supervisor: ["contract.read", "job.read", "extra.log", "extra.price", "extra.approve", "dashboard.read", "resident.read"],
  surveyor: ["contract.read", "job.read", "extra.price", "extra.approve", "dashboard.read", "resident.read"],
  commercial_manager: ["client.invite", "contract.read", "contract.manage", "job.read", "extra.price", "extra.approve", "dashboard.read", "resident.read"],
  finance: ["contract.read", "data.export", "data.import", "statement.read"],
  read_only: ["contract.read", "job.read", "dashboard.read"],
  client_approver: ["contract.read", "extra.approve"],
};
const uuid = z.string().uuid();
const pence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const contractorScopeV1 = z.object({ kind: z.enum(["tenant", "region", "branch", "team", "client"]), id: uuid }).strict();
export type ContractorScope = z.infer<typeof contractorScopeV1>;
export type ContractorGrant = { role: ContractorRole; scope: ContractorScope; contractId?: string | null };
export type ContractorTarget = { tenantId: string; regionId?: string; branchId?: string; teamId?: string; clientId?: string; contractId?: string; assigned?: boolean; awaitingClientDecision?: boolean };
/** Missing scope/assignment denies; the caller supplies persisted identities, never browser assertions. */
export function contractorPermits(grants: readonly ContractorGrant[], permission: ContractorPermission, target: ContractorTarget): boolean {
  return grants.some(({ role, scope, contractId }) => {
    if (!contractorPermissionMatrix[role].includes(permission)) return false;
    if (role === "client_approver") return scope.kind === "client" && scope.id === target.clientId && (!contractId || contractId === target.contractId) && (permission === "contract.read" || target.awaitingClientDecision === true);
    if (scope.kind === "client") return false;
    if (role === "finance" && scope.kind !== "tenant") return false;
    const inScope = scope.kind === "tenant" ? scope.id === target.tenantId : scope.id === (scope.kind === "region" ? target.regionId : scope.kind === "branch" ? target.branchId : target.teamId);
    return inScope && (role !== "operative" || target.assigned === true);
  });
}
export function roleAllowedOnTrack(role: string, track: "contractor" | "small_builder") {
  return track === "contractor" ? (contractorRoles as readonly string[]).includes(role) : ["owner", "admin", "estimator", "foreman", "operative", "finance", "read_only"].includes(role);
}
const approver = z.enum(["supervisor", "surveyor", "commercial_manager"]);
const step = z.object({ role: approver, timeLimitMinutes: z.number().int().min(1).max(525600), escalationRole: approver, alternateRoles: z.array(approver).max(3) }).strict();
/** Schema only: evaluation and commercial authorization belong to ENT-5. */
export const approvalRulesV1 = z.object({
  version: z.literal("approval-rules.v1"), proceedLimit: z.object({ pence, currency: z.literal("GBP") }).strict(),
  bands: z.array(z.object({ upToPence: pence.nullable(), steps: z.array(step).max(8) }).strict()).min(1).max(20),
  clientApproval: z.discriminatedUnion("kind", [z.object({ kind: z.literal("none") }).strict(), z.object({ kind: z.literal("threshold"), abovePence: pence, beforeWorkAbovePence: pence, timeLimitMinutes: z.number().int().min(1).max(525600) }).strict()]),
  evidence: z.object({ photosRequired: z.boolean(), residentConfirmationRequired: z.boolean() }).strict(),
}).strict().superRefine((value, context) => {
  let previous = -1;
  value.bands.forEach((band, index) => {
    if (band.upToPence === null ? index !== value.bands.length - 1 : band.upToPence <= previous) context.addIssue({ code: "custom", path: ["bands", index, "upToPence"], message: "Bands must increase and end in one unbounded band" });
    if (band.upToPence !== null) previous = band.upToPence;
  });
  if (value.bands.at(-1)?.upToPence !== null) context.addIssue({ code: "custom", path: ["bands"], message: "The last band must be unbounded" });
});
export const referenceApprovalRulesV1 = approvalRulesV1.parse({ version: "approval-rules.v1", proceedLimit: { pence: 25000, currency: "GBP" }, bands: [{ upToPence: 25000, steps: [{ role: "supervisor", timeLimitMinutes: 1440, escalationRole: "surveyor", alternateRoles: [] }] }, { upToPence: null, steps: [{ role: "commercial_manager", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] }], clientApproval: { kind: "none" }, evidence: { photosRequired: true, residentConfirmationRequired: false } });
const date = z.string().date();
export const clientContractDocumentV1 = z.object({
  version: z.literal("client-contract.v1"), reference: z.string().min(1).max(80), startsOn: date, endsOn: date.nullable(),
  sorVersionIds: z.array(uuid).max(100), tenderedAdjustment: z.object({ numerator: z.string().regex(/^-?(0|[1-9]\d{0,11})$/u), denominator: z.string().regex(/^[1-9]\d{0,11}$/u) }).strict(),
  photoRule: z.enum(["required", "optional"]), vatCode: z.literal("synthetic-unreviewed"), exportedNotBilledAlertDays: z.number().int().min(1).max(3650).default(30),
}).strict().refine(v => !v.endsOn || v.endsOn >= v.startsOn, { message: "End date precedes start date", path: ["endsOn"] });
const base = { version: z.literal("contractor-command.v1"), environment: z.literal("synthetic_demo"), commandId: uuid, expectedRevision: z.number().int().nonnegative(), id: uuid };
export const contractorCommandV1 = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("unit.create"), unitKind: z.enum(["region", "branch"]), parentId: uuid, name: z.string().min(1).max(100) }).strict(),
  z.object({ ...base, kind: z.literal("team.create"), branchId: uuid, name: z.string().min(1).max(100) }).strict(),
  z.object({ ...base, kind: z.literal("member.invite"), role: z.enum(contractorRoles), email: z.string().email().endsWith(".invalid"), clientId: uuid.nullable(), contractId: uuid.nullable(), scope: contractorScopeV1 }).strict(),
  z.object({ ...base, kind: z.literal("grant.create"), membershipId: uuid, role: z.enum(contractorRoles), scope: contractorScopeV1, contractId: uuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal("grant.revoke"), grantId: uuid }).strict(),
  z.object({ ...base, kind: z.literal("membership.revoke"), membershipId: uuid }).strict(),
  z.object({ ...base, kind: z.literal("team.move"), membershipId: uuid, fromTeamId: uuid.nullable(), toTeamId: uuid }).strict(),
  z.object({ ...base, kind: z.literal("client.create"), branchId: uuid, name: z.string().min(1).max(100), clientType: z.enum(["housing_association", "local_authority", "insurer", "landlord_or_agent", "person", "main_contractor"]) }).strict(),
  z.object({ ...base, kind: z.literal("contract.revise"), clientId: uuid, contractId: uuid, document: clientContractDocumentV1, rules: approvalRulesV1 }).strict(),
]).superRefine((command, context) => {
  if (command.kind !== "member.invite" && command.kind !== "grant.create") return;
  const clientRole = command.role === "client_approver";
  if (clientRole ? command.scope.kind !== "client" : command.scope.kind === "client") {
    context.addIssue({ code: "custom", path: ["scope", "kind"], message: "Only client approvers use client scope" });
  }
  if (command.role === "finance" && command.scope.kind !== "tenant") {
    context.addIssue({ code: "custom", path: ["scope", "kind"], message: "Finance requires tenant scope" });
  }
  if (!clientRole && command.contractId !== null) {
    context.addIssue({ code: "custom", path: ["contractId"], message: "Only client approvers may be restricted to a contract" });
  }
  if (command.kind === "member.invite" && (clientRole ? command.clientId !== command.scope.id : command.clientId !== null)) {
    context.addIssue({ code: "custom", path: ["clientId"], message: "Client invitations must bind the client scope; internal members have no client binding" });
  }
});
export type ContractorCommand = z.infer<typeof contractorCommandV1>;
export const contractorQueryV1 = z.object({ version: z.literal("contractor-query.v1"), tenantId: uuid, resource: z.enum(["organisation", "contracts"]), id: uuid.optional() }).strict();
export class ContractorError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "STALE_REVISION" | "COMMAND_CONFLICT" | "INVALID_RULE_DOCUMENT" | "INVALID_COMMAND" | "MODE_FORBIDDEN") { super(code); }
}
export const contractorWorkspaceV1 = z.object({
 version: z.literal("contractor-workspace.v1"), environment: z.literal("synthetic_demo"), tenantId: uuid, membershipId: uuid, revision: z.number().int().nonnegative(), realExternalActions: z.literal(0),
 units: z.array(z.object({id:uuid,kind:z.enum(["tenant","region","branch"]),parent_id:uuid.nullable(),name:z.string()})),
 teams: z.array(z.object({id:uuid,branch_id:uuid,name:z.string()})),
 members: z.array(z.object({membership_id:uuid,email:z.string().email().endsWith(".invalid"),client_id:uuid.nullable(),revoked:z.boolean()})),
 grants: z.array(z.object({id:uuid,membership_id:uuid,role:z.enum(contractorRoles),scope_kind:contractorScopeV1.shape.kind,scope_id:uuid,revoked:z.boolean()})),
 teamMemberships: z.array(z.object({membership_id:uuid,team_id:uuid,active:z.boolean()})),
 clients: z.array(z.object({id:uuid,name:z.string(),branch_id:uuid})),
 contracts: z.array(z.object({id:uuid,contract_id:uuid,client_id:uuid,revision:z.number().int().positive(),document:clientContractDocumentV1,rule_version_id:uuid,rules:approvalRulesV1})),
}).strict();
export type ContractorWorkspace = z.infer<typeof contractorWorkspaceV1>;
