/** Same-origin transport. Unknown writes remain blocked, including after a page reload. */
export class PracticeError extends Error {
  constructor(message: string, public readonly kind: 'unavailable' | 'refused' | 'unknown' | 'invalid') { super(message); }
}
export type PendingStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PENDING_KEY = 'jobguard-ui-practice-pending.v1';
export class PracticeTransport {
  private blocked = false;
  private busy = false;
  constructor(private readonly request: typeof fetch = fetch, private readonly store?: PendingStore, private readonly timeout = 15000) {
    try { this.blocked = !!store?.getItem(PENDING_KEY); } catch { this.blocked = true; }
  }
  get outcomeUnknown(): boolean { return this.blocked; }
  async read(path: string): Promise<unknown> {
    this.path(path);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.request(path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new PracticeError(response.status === 401 ? 'Sign in to the existing practice hub first.' : response.status === 403 ? 'Your signed-in role cannot access this record.' : `Practice service unavailable (HTTP ${response.status}). No example records have been substituted.`, 'unavailable');
      try { return await response.json(); } catch { throw new PracticeError('The practice response was not valid JSON.', 'invalid'); }
    } catch (error) { if (error instanceof PracticeError) throw error; throw new PracticeError('The practice service could not be reached. No example records have been substituted.', 'unavailable'); }
    finally { clearTimeout(timer); }
  }
  async write(path: string, body: Record<string, unknown>): Promise<unknown> {
    this.path(path);
    if (this.blocked) throw new PracticeError('A previous result is unknown. Inspect the existing practice records before attempting another action.', 'unknown');
    if (this.busy) throw new PracticeError('An action is already being submitted.', 'refused');
    this.busy = true;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
    // Do not start a write unless its unknown-outcome guard can survive reload.
    if (!this.store) { this.busy = false; clearTimeout(timer); throw new PracticeError('Session storage is unavailable. Practice writes are disabled; use the existing practice app.', 'unavailable'); }
    try { this.store.setItem(PENDING_KEY, JSON.stringify({ commandId: body.commandId ?? null, path, startedAt: new Date().toISOString() })); }
    catch { this.busy = false; clearTimeout(timer); throw new PracticeError('Unable to keep an interrupted-action record. Nothing was submitted.', 'unavailable'); }
    try {
      const response = await this.request(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      // A server-side error may follow a committed effect. Never turn it into retryable failure.
      if (response.status >= 500) throw new Error('Server result unknown');
      if (!response.ok) {
        if (response.status === 408 || response.status === 409) throw new Error('Outcome needs reconciliation');
        let code = ''; try { const value = await response.json(); if (typeof value?.code === 'string') code = value.code.slice(0, 80); } catch { /* status is still an explicit refusal */ }
        this.store.removeItem(PENDING_KEY);
        throw new PracticeError(`The server refused this action (HTTP ${response.status}${code ? ` · ${code}` : ''}). Nothing is shown as completed.`, 'refused');
      }
      const result: unknown = await response.json();
      // Keep the guard until the caller validates the success schema.
      this.blocked = true;
      return result;
    } catch (error) {
      if (error instanceof PracticeError && error.kind === 'refused') throw error;
      this.blocked = true;
      throw new PracticeError('Result unknown. The server may have recorded the action. Do not repeat it; inspect the practice records first.', 'unknown');
    } finally { this.busy = false; clearTimeout(timer); }
  }
  confirmedByValidatedResponse(): void {
    try { this.store?.removeItem(PENDING_KEY); this.blocked = false; }
    catch { this.blocked = true; throw new PracticeError('The action responded, but its local interruption marker could not be cleared. Inspect the practice app.', 'unknown'); }
  }
  private path(path: string): void {
    if (!/^\/api\/(northside(?:\/|$)|contractor\/)/.test(path) || path.includes('..') || path.includes('\\') || /[\r\n]/.test(path)) throw new PracticeError('Only existing same-origin practice routes are permitted.', 'invalid');
  }
}
