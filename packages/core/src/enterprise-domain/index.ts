/** Public enterprise schemas and pure domain assertions; implementation helpers stay internal. */
export {
  EnterpriseDomainError, enterpriseRoles, enterpriseStates, enterpriseCommands, enterpriseModeV1,
  enterpriseGrantV1, enterpriseActorV1, enterpriseRequirementV1, enterpriseApprovalV1, enterpriseRevisionV1,
  enterpriseExtraV1, enterpriseGroupV1, enterprisePromptProposalV1, enterpriseAgreementV1,
  enterpriseStatementV1, enterpriseReceiptV1, enterpriseTransitionV1,
  originForCommand, parseEnterpriseGroup, parseEnterprisePromptProposal,
} from "./contracts.js";
export type {
  EnterpriseGrant, EnterpriseActor, EnterpriseRequirement, EnterpriseApproval, EnterpriseRevision,
  EnterpriseExtra, EnterpriseGroup, EnterprisePromptProposal, EnterpriseAgreement, EnterpriseStatementInput,
} from "./contracts.js";
export { transitionExtra } from "./transitions.js";
export {
  assertDuplicateGroup, effectiveOrigin, siteOriginated, qualifyingPrincipal, feeBearing,
  assertOriginUnchanged, assertDuplicateRepair, coalescePrompt,
} from "./origin.js";
export {
  allocateEnterpriseReceipt, statementLines, deriveEnterpriseStatement, deriveEnterpriseReferenceStatement,
} from "./fee.js";
export type {
  EnterpriseReceiptAllocation, EnterpriseStatementLine, EnterpriseDerivedStatementLine,
  EnterpriseFeeSection, EnterpriseFeeDerivation,
} from "./fee.js";
