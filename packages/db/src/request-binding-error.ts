/** Binding refusal carries a public code and no database detail or credential. */
export class RequestBindingRefusedError extends Error {
  readonly code = "FORBIDDEN";
  constructor(readonly sessionKind: "real" | "practice" | "contractor_practice" = "real") { super("FORBIDDEN"); this.name = "RequestBindingRefusedError"; }
}

/** Translate only a failed bind, after withTenant has rolled back and released the client. */
export function mapRequestBindingRefusal<T>(work: Promise<T>, refusal: () => Error): Promise<T> {
  return work.catch(error => {
    if (error instanceof RequestBindingRefusedError) throw refusal();
    throw error;
  });
}
