import { expect, expectTypeOf, it } from "vitest";
import ts from "typescript";
import { enterprisePromptProposalV1, parseEnterprisePromptProposal, parseEnterpriseGroup, enterpriseGroupV1, EnterpriseDomainError } from "./index.js";
import type { EnterprisePromptProposal } from "./index.js";
import { group,id,hash,extra } from "./origin.test.js";
const proposal={version:"enterprise-prompt-proposal.v1",tenantId:id(20),jobId:id(21),scopeItemId:id(22),coalescingKey:"fictional-work",description:"Generated evidence proposal",producer:{kind:"model",modelVersion:"generated-model",promptVersion:"generated-prompt",schemaVersion:"enterprise-prompt-proposal.v1"},sources:[{evidenceId:id(60),hash:hash()}]};
it("compile-time enterprise proposal fields exclude authority",()=>{
 expectTypeOf<keyof EnterprisePromptProposal>().exclude<"origin"|"price"|"approval"|"fee">().toEqualTypeOf<keyof EnterprisePromptProposal>();
 const p=parseEnterprisePromptProposal(proposal);
 // @ts-expect-error proposals carry no origin authority
 void p.origin;
 // @ts-expect-error proposals carry no price authority
 void p.price;
 // @ts-expect-error proposals carry no approval authority
 void p.approval;
 // @ts-expect-error proposals carry no fee authority
 void p.fee;
});
it("strict runtime proposal fields, shape/identity/hash/mode/revision refusals",()=>{
 expect(enterprisePromptProposalV1.safeParse(proposal).success).toBe(true);
 for(const field of ["origin","price","pricePence","approval","fee","feeBearing","role","mode","feeGate","settlement","tenantAuthority"])expect(()=>parseEnterprisePromptProposal({...proposal,[field]:true})).toThrow(EnterpriseDomainError);
 expect(()=>parseEnterpriseGroup(proposal)).toThrow(EnterpriseDomainError);expect(()=>parseEnterprisePromptProposal(group())).toThrow(EnterpriseDomainError);
 for(const change of [{version:"v0"},{currency:"EUR"},{mode:"forged"},{feeGate:"open"},{jobTrack:"wrong"},{tenantId:id(99)},{jobId:id(99)}])expect(()=>parseEnterpriseGroup({...group(),...change})).toThrow(EnterpriseDomainError);
 for(const change of [{scopeItemId:id(98)},{revisionId:id(98)},{revisionHash:hash("b")},{tenantId:id(98)},{jobId:id(98)}]) {const g=group();Object.assign(g.members[0]!.billingFacts[0]!,change);expect(()=>parseEnterpriseGroup(g)).toThrow(EnterpriseDomainError);}
 const e=extra();e.origin.tenantId=id(98);expect(enterpriseGroupV1.safeParse(group([e])).success).toBe(false);
});
it("new subdirectory production source is pure and directly reuses SH-1 kernels; money operators are bigint",()=>{
 const files=["contracts","transitions","origin","fee","index"];
 const allowedImports=new Set(["zod","../money.js","../cumulative-fee.js","../receipt-allocation.js","../extra-origin.js","../allocation.js","./contracts.js","./transitions.js","./origin.js","./fee.js"]);
 const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,ts.sys.getCurrentDirectory());
 const program=ts.createProgram(files.map(f=>`src/enterprise-domain/${f}.ts`),parsed.options),checker=program.getTypeChecker();
 for(const f of files) {const path=`src/enterprise-domain/${f}.ts`,source=ts.sys.readFile(path)!;
  expect(source).not.toMatch(/from\s+["'](?:node:|pg|postgres|@jobguard\/db|@aws-sdk|stripe|@anthropic|react|next)|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u);
  expect(source).not.toMatch(/(?:function|const)\s+(?:calculateCumulativeFee|allocateReceiptToLines)\b/u);
  const tree=program.getSourceFile(path)!;
  const visit=(node:ts.Node)=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)expect(ts.isStringLiteral(node.moduleSpecifier)&&allowedImports.has(node.moduleSpecifier.text),`${path}: import allow-list`).toBe(true);
   if(ts.isIdentifier(node))expect(["fetch","XMLHttpRequest","WebSocket","process","require","globalThis","Buffer"].includes(node.text),`${path}: platform/global call`).toBe(false);
   if(ts.isCallExpression(node))expect(node.expression.kind===ts.SyntaxKind.ImportKeyword,`${path}: dynamic import`).toBe(false);
   if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AsteriskToken,ts.SyntaxKind.SlashToken,ts.SyntaxKind.AsteriskEqualsToken,ts.SyntaxKind.SlashEqualsToken].includes(node.operatorToken.kind))for(const op of [node.left,node.right])expect(checker.getTypeAtLocation(op).flags&ts.TypeFlags.BigIntLike,`${path}: ${node.getText()}`).not.toBe(0);ts.forEachChild(node,visit);};visit(tree);
 }
 const source=ts.sys.readFile("src/enterprise-domain/fee.ts")!;expect(source).toMatch(/calculateCumulativeFee[\s\S]*from "\.\.\/cumulative-fee\.js"/u);expect(source).toMatch(/allocateReceiptToLines[\s\S]*from "\.\.\/receipt-allocation\.js"/u);expect(source).toMatch(/allocateMoney[\s\S]*from "\.\.\/allocation\.js"/u);
});
it("photo evidence identity cannot be relabelled across tenant/job/scope",()=>{
 const g=group();g.members[0]!.captureNote=null;
 g.members[0]!.photo={status:"verified",evidenceId:id(60),hash:hash(),tenantId:id(20),jobId:id(21),scopeItemId:id(22),objectVersionId:"generated-immutable-version"};
 expect(parseEnterpriseGroup(g).members[0]!.photo.evidenceId).toBe(id(60));
 for(const field of ["tenantId","jobId","scopeItemId"] as const) {const forged=structuredClone(g);forged.members[0]!.photo[field]=id(99);expect(()=>parseEnterpriseGroup(forged)).toThrow(EnterpriseDomainError);}
 for(const field of ["origin","price","approval","fee"]){expect(enterprisePromptProposalV1.safeParse({...proposal,producer:{...proposal.producer,[field]:true}}).success).toBe(false);expect(enterprisePromptProposalV1.safeParse({...proposal,sources:[{...proposal.sources[0],[field]:true}]}).success).toBe(false);}
});
