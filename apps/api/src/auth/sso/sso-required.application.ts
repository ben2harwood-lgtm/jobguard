import { z } from "zod";
import { EnterpriseIdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import type { DeploymentMode } from "@jobguard/config";
import { AuthError } from "../auth-provider.js";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../principal-bridge.js";
import { SsoAuthProvider } from "./sso.application.js";
import { requireSyntheticSso } from "./sso.contracts.js";
import { SsoRequiredError, ssoRequiredCodes, ssoRequiredCommandV1, ssoRequiredViewV1, ssoEmergencyV1 } from "./sso-required.contracts.js";
function typed(error:unknown):SsoRequiredError {
  if(error instanceof SsoRequiredError)return error;
  if(error instanceof AuthError)return new SsoRequiredError("SSO_REQUIRED_FORBIDDEN");
  const message=error instanceof Error?error.message:undefined;
  if(message && ssoRequiredCodes.some(code=>code===message))return new SsoRequiredError(message as SsoRequiredError['code']);
  if(message==="SSO_FORBIDDEN")return new SsoRequiredError("SSO_REQUIRED_FORBIDDEN");
  return new SsoRequiredError("SSO_REQUIRED_UNAVAILABLE",{cause:error});
}
/** Same application for Nest and Next. Required mode has no permissive default. */
export class SsoRequiredApplication {
  readonly provider:SsoAuthProvider;
  constructor(readonly base:PersistedAuthProvider,readonly repository:SsoRequiredRepository,readonly allowedOrigin:string,readonly mode:DeploymentMode) {
    this.provider=new SsoAuthProvider(base,new EnterpriseIdentityRepository(base.repository.pool));
  }
  private gate():void {requireSyntheticSso(this.mode,"in-process-test-idp");}
  async view(raw:unknown,credentials:TenantRequestCredentials) {
    let target="sso-required";
    try {
      this.gate();const input=ssoRequiredViewV1.parse(raw);
      const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:input.requested_tenant_id},this.allowedOrigin);
      const principal=await this.provider.authenticate(credentials.sessionToken!);
      if(!principal)throw new SsoRequiredError("SSO_REQUIRED_FORBIDDEN");
      const scope=await this.repository.enterprise.sessionScope(principal.sessionId);
      target=scope?.connectionId??"sso-required";
      return await this.repository.view(context,this.base.digest(`session:${credentials.sessionToken}`));
    }catch(error){const failure=error instanceof z.ZodError||error instanceof SyntaxError?new SsoRequiredError("INVALID_SSO_REQUIRED_INPUT"):typed(error);await this.repository.refusal(target,failure.code);throw failure;}
  }
  async command(raw:unknown,credentials:TenantRequestCredentials) {
    let target="sso-required";
    try {
      this.gate();const input=ssoRequiredCommandV1.parse(raw);
      const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:input.requested_tenant_id},this.allowedOrigin);
      const principal=await this.provider.authenticate(credentials.sessionToken!);
      if(!principal)throw new SsoRequiredError("SSO_REQUIRED_FORBIDDEN");
      const scope=await this.repository.enterprise.sessionScope(principal.sessionId);
      target=scope?.connectionId??"sso-required";
      try {return await this.repository.command(context,this.base.digest(`session:${credentials.sessionToken}`),input);}
      catch(error) {
        // An ordinary administrator with the switch OFF has no binding. A permission-checked SQL view
        // may derive the configured connection after the command rollback; no caller-supplied target.
        if(target==="sso-required") {
          try {target=await this.repository.refusalTarget(context,this.base.digest(`session:${credentials.sessionToken}`))??target;}catch { /* No tenant authority: global refusal only. */ }
        }
        throw error;
      }
    }catch(error){const failure=error instanceof z.ZodError||error instanceof SyntaxError?new SsoRequiredError("INVALID_SSO_REQUIRED_INPUT"):typed(error);await this.repository.refusal(target,failure.code);throw failure;}
  }
  async emergency(raw:unknown,origin:string|undefined) {
    let cause="EMERGENCY_ROUTE_BLOCKED";
    try {
      this.gate();cause="EMERGENCY_INPUT_INVALID";const input=ssoEmergencyV1.parse(raw);
      cause="EMERGENCY_ORIGIN_REFUSED";
      if(origin!==this.allowedOrigin)throw new SsoRequiredError("SSO_EMERGENCY_REFUSED");
      cause="EMERGENCY_MAILBOX_REFUSED";
      const user=await this.base.proveEmergencyMailbox(input.email,input.code);
      if(!user)throw new SsoRequiredError("SSO_EMERGENCY_REFUSED");
      cause="EMERGENCY_UNAVAILABLE";
      const result=await this.repository.emergency(user,input);cause=result.cause;
      if(!result.used)throw new SsoRequiredError("SSO_EMERGENCY_REFUSED");
      return {version:"sso-emergency-response.v1" as const,environment:"synthetic_demo" as const,required:false as const};
    }catch {
      // One public response for every cause. Tenant log/audit, where authorized, already committed together.
      try {await this.repository.refusal("emergency",cause);}
      catch(error){throw new SsoRequiredError("SSO_EMERGENCY_REFUSED",{cause:error});}
      throw new SsoRequiredError("SSO_EMERGENCY_REFUSED");
    }
  }
  async refuseInput(emergency=false):Promise<never> {
    let code:SsoRequiredError['code']=emergency?"SSO_EMERGENCY_REFUSED":"INVALID_SSO_REQUIRED_INPUT";
    try {this.gate();}catch(error){code=emergency?"SSO_EMERGENCY_REFUSED":typed(error).code;}
    try {await this.repository.refusal(emergency?"emergency":"sso-required",code);}
    catch(error){throw new SsoRequiredError(emergency?"SSO_EMERGENCY_REFUSED":"SSO_REQUIRED_UNAVAILABLE",{cause:error});}
    throw new SsoRequiredError(code);
  }
}
