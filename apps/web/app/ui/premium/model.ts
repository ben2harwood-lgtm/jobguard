import { pounds, parsePounds } from './money';
export { pounds, parsePounds, totalPence } from './money';
/** Fictional design state ONLY. Never import this module into a server command or ledger. */
export type Persona = 'operative' | 'surveyor' | 'supervisor' | 'finance' | 'client' | 'builder';
export type ExtraState = 'logged' | 'priced' | 'awaiting_supervisor' | 'awaiting_client' | 'approved' | 'rejected' | 'withdrawn';
export type Extra = { id: string; job: string; description: string; note: string; pence: number | null; state: ExtraState; revision: number; photo: boolean; resident: boolean; history: string[]; origin: 'site'; source: 'design' };
export type Draft = { job: string; description: string; note: string; photo: boolean; resident: boolean };
export const personas: { id: Persona; name: string; job: string; initials: string }[] = [
  { id: 'operative', name: 'Alex Morgan', job: 'Site operative', initials: 'AM' },
  { id: 'surveyor', name: 'Sam Ellis', job: 'Surveyor', initials: 'SE' },
  { id: 'supervisor', name: 'Jamie Taylor', job: 'Supervisor', initials: 'JT' },
  { id: 'finance', name: 'Casey Wood', job: 'Commercial office', initials: 'CW' },
  { id: 'client', name: 'Robin Lee', job: 'Invited client', initials: 'RL' },
  { id: 'builder', name: 'Morgan Reed', job: 'Small-builder owner', initials: 'MR' }
];
export const jobs = [
  { id: 'WO-1042', name: 'Oakfield · Kitchen repairs', site: 'Fictional property 14', client: 'Northside Homes', progress: 60, included: 'Replace kitchen tap; repair two cupboard hinges.', tag: 'In progress' },
  { id: 'WO-1048', name: 'Riverside · Bathroom refresh', site: 'Fictional property 27', client: 'Riverside Housing', progress: 25, included: 'Replace basin; renew silicone around bath.', tag: 'Today' },
  { id: 'WO-1053', name: 'Meadow Lane · Joinery', site: 'Fictional property 8', client: 'Northside Homes', progress: 0, included: 'Ease and adjust two internal doors.', tag: 'Tomorrow' }
];
export const statusLabels: Record<ExtraState, string> = { logged: 'Needs pricing', priced: 'Ready to submit', awaiting_supervisor: 'Supervisor review', awaiting_client: 'Client review', approved: 'Approved · not billed', rejected: 'Rejected', withdrawn: 'Withdrawn' };
export const emptyDraft = (): Draft => ({ job: jobs[0]!.id, description: '', note: '', photo: false, resident: false });
export const seedExtras = (): Extra[] => [
  { id: 'EX-2101', job: 'WO-1042', description: 'Replace damaged waste pipe beneath sink', note: 'Leak found when the existing tap was removed. Not part of the instructed tap replacement.', pence: null, state: 'logged', revision: 1, photo: true, resident: true, history: ['Fictional site record created · revision 1'], origin: 'site', source: 'design' },
  { id: 'EX-2102', job: 'WO-1048', description: 'Replace cracked basin isolation valve', note: 'Valve body damaged; the instructed basin replacement is a separate line.', pence: 18500, state: 'awaiting_supervisor', revision: 2, photo: true, resident: true, history: ['Fictional site record created', 'Price reviewed in design preview', 'Submitted for supervisor review'], origin: 'site', source: 'design' },
  { id: 'EX-2103', job: 'WO-1053', description: 'Renew water-damaged door lining', note: 'Extra work above the instructed door adjustment.', pence: 32000, state: 'awaiting_client', revision: 2, photo: true, resident: true, history: ['Fictional site record created', 'Price reviewed', 'Supervisor approved · design scenario'], origin: 'site', source: 'design' },
  { id: 'EX-2104', job: 'WO-1042', description: 'Repair damaged cupboard base panel', note: 'Replacement base panel, separate from the two hinges on the order.', pence: 9500, state: 'approved', revision: 2, photo: true, resident: true, history: ['Fictional site record created', 'Pricing reviewed', 'Supervisor approved', 'Client approved · not billed or paid'], origin: 'site', source: 'design' }
];
export function validateDraft(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!jobs.some(j => j.id === draft.job)) errors.job = 'Choose an assigned fictional job.';
  if (!draft.description.trim() || draft.description.length > 500) errors.description = 'Describe the extra work in 1–500 characters.';
  if (!draft.note.trim() || draft.note.length > 5000) errors.note = 'Explain what is outside the order in 1–5,000 characters.';
  if (!draft.photo) errors.photo = 'Attach the fictional evidence example.';
  if (!draft.resident) errors.resident = 'Review the fictional acknowledgement first.';
  return errors;
}
export function createDesignExtra(draft: Draft, id: string): Extra {
  const errors = validateDraft(draft); if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return { id, job: draft.job, description: draft.description.trim(), note: draft.note.trim(), pence: null, state: 'logged', revision: 1, photo: draft.photo, resident: draft.resident, history: ['Created in design preview · not stored on the JobGuard server'], origin: 'site', source: 'design' };
}
export type DesignAction = 'price' | 'submit' | 'approve' | 'reject' | 'withdraw' | 'revise';
/** UI rehearsal only; production authorization and transitions belong to the existing backend. */
export function transition(extra: Extra, action: DesignAction, persona: Persona, expectedRevision: number, detail = ''): Extra {
  if (extra.source !== 'design') throw new Error('Server records cannot enter the design simulator.');
  if (expectedRevision !== extra.revision) throw new Error('This revision has changed. Review it again.');
  let state = extra.state, pence = extra.pence, event = '', note = extra.note;
  if (action === 'price' && persona === 'surveyor' && extra.state === 'logged') { pence = parsePounds(detail); state = 'priced'; event = `Fictional price reviewed: ${pounds(pence)}`; }
  else if (action === 'submit' && persona === 'supervisor' && extra.state === 'priced') { state = 'awaiting_supervisor'; event = 'Submitted for supervisor review · design only'; }
  else if (action === 'approve' && persona === 'supervisor' && extra.state === 'awaiting_supervisor') { state = 'awaiting_client'; event = 'Supervisor approved · design only'; }
  else if (action === 'approve' && persona === 'client' && extra.state === 'awaiting_client') { state = 'approved'; event = 'Client approved · design only; no billing or payment'; }
  else if (action === 'reject' && ((persona === 'supervisor' && extra.state === 'awaiting_supervisor') || (persona === 'client' && extra.state === 'awaiting_client'))) { if (!detail.trim()) throw new Error('Give a reason for rejection.'); state = 'rejected'; event = `Rejected in design preview: ${detail.trim()}`; }
  else if (action === 'withdraw' && persona === 'operative' && extra.state === 'logged') { if (!detail.trim()) throw new Error('Give a reason for withdrawal.'); state = 'withdrawn'; event = `Withdrawn in design preview: ${detail.trim()}`; }
  else if (action === 'revise' && persona === 'operative' && ['rejected', 'withdrawn'].includes(extra.state)) { if (!detail.trim()) throw new Error('Explain the revised work.'); state = 'logged'; pence = null; note = detail.trim(); event = 'Revised in design preview · previous approvals cannot be reused'; }
  else throw new Error('This fictional role cannot perform that action at this stage.');
  return { ...extra, state, pence, note, revision: extra.revision + 1, history: [...extra.history, event] };
}
export function attentionFor(persona: Persona, e: Extra): boolean {
  return (persona === 'surveyor' && e.state === 'logged') || (persona === 'supervisor' && ['priced', 'awaiting_supervisor'].includes(e.state)) || (persona === 'client' && e.state === 'awaiting_client') || (persona === 'finance' && e.state === 'approved');
}
const allowedStates: ExtraState[] = ['logged','priced','awaiting_supervisor','awaiting_client','approved','rejected','withdrawn'];
export function restoreDesign(text: string | null): Extra[] | null {
  if (!text || text.length > 500000) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data) || data.length > 100) return null;
    const result: Extra[] = []; const ids = new Set<string>();
    for (const value of data) {
      if (!value || typeof value !== 'object') return null;
      const e = value as Extra;
      if (e.source !== 'design' || e.origin !== 'site' || !jobs.some(j => j.id === e.job) || typeof e.id !== 'string' || e.id.length > 80 || ids.has(e.id) || typeof e.description !== 'string' || e.description.length > 500 || typeof e.note !== 'string' || e.note.length > 5000 || !allowedStates.includes(e.state) || !Number.isSafeInteger(e.revision) || e.revision < 1 || !(e.pence === null || (Number.isSafeInteger(e.pence) && e.pence > 0)) || typeof e.photo !== 'boolean' || typeof e.resident !== 'boolean' || !Array.isArray(e.history) || e.history.length > 200 || !e.history.every(h => typeof h === 'string' && h.length <= 6000)) return null;
      ids.add(e.id); result.push({ id:e.id, job:e.job, description:e.description, note:e.note, pence:e.pence, state:e.state, revision:e.revision, photo:e.photo, resident:e.resident, history:[...e.history], source:'design', origin:'site' });
    }
    return result;
  } catch { return null; }
}
