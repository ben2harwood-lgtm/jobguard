import { executeAuthorizedCommercialAction, type ExactAction, type TenantTransaction } from "@jobguard/db";
import type { CommercialAdapter } from "./commercial-adapter.port.js";

/** Sole adapter invocation point; inline approval reaches this boundary via the command dispatcher. */
export const invokeCommercialAdapter = <T>(database: TenantTransaction, authorizationId: string, action: ExactAction, adapter: CommercialAdapter<T>) =>
  executeAuthorizedCommercialAction(database, authorizationId, action, () => adapter.execute());
