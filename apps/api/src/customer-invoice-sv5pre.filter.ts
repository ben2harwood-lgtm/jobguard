import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { FinalAccountLockError } from "@jobguard/core";

/** Maps only the closed typed domain family; raw SQL diagnostics are never serialized. */
@Catch(FinalAccountLockError)
export class CustomerInvoiceSv5preFilter implements ExceptionFilter {
 catch(error: FinalAccountLockError, host: ArgumentsHost) {
  const response = host.switchToHttp().getResponse();
  response.setHeader("Cache-Control", "no-store");
  response.status(409).json({ version: "final-check-invoice-error.v1", code: error.code });
 }
}
