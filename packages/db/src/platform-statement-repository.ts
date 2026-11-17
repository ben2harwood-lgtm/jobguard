import type { VerifiedTenantContext } from "./tenant-context.js";
import { SubscriptionPersistenceError, type SubscriptionRepositoryPort } from "./subscription-repository.js";
/** The namespace is shared; this reader releases only subscription documents after a current company check. */
export class PlatformSubscriptionStatementRepository {
 constructor(private readonly subscriptions:SubscriptionRepositoryPort){}
 async read(context:VerifiedTenantContext,digest:string,statementId:string){
  const snapshot=await this.subscriptions.read(context,digest);
  const statement=snapshot.statements.find(row=>row.id===statementId);
  if(!statement)throw new SubscriptionPersistenceError("SUBSCRIPTION_FORBIDDEN");
  return statement;
 }
}
