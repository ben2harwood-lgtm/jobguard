/** Formatting and exact integer-pence UI helpers; no records, side effects or policy decisions. */
export function pounds(pence: number | null): string {
  if (pence === null) return 'Unpriced';
  if (!Number.isSafeInteger(pence)) throw new Error('Money must be integer pence.');
  const sign = pence < 0 ? '−' : ''; const a = Math.abs(pence);
  return `${sign}£${Math.floor(a / 100).toLocaleString('en-GB')}.${String(a % 100).padStart(2, '0')}`;
}
export function parsePounds(value: string): number {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter pounds and pence, for example 185.50.');
  const [whole, decimals = ''] = value.trim().split('.');
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Enter an amount greater than zero.');
  return result;
}
export function totalPence(items: ReadonlyArray<{pence:number|null}>): number {
  return items.reduce((n, e) => { const r = n + (e.pence ?? 0); if (!Number.isSafeInteger(r)) throw new Error('Total is outside the supported range.'); return r; }, 0);
}
