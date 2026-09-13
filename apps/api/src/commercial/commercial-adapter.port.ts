/** M0-9 adapters implement this port. Application features must never import it directly. */
export interface CommercialAdapter<TResult = unknown> {
  execute(): Promise<TResult>;
}
