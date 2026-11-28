// A browser component harness for the real parser and review screen, with no app server.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewProposal } from '../../../../apps/web/app/ui/review-proposal';
import { captureWorkspaceResponseV1 } from '../../../../apps/api/src/capture/contracts';
import { parseCaptureFixture } from '../capture-fixture-parser';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = createRoot(document.getElementById('root')!);
function mount(result: unknown) {
  const value = captureWorkspaceResponseV1.parse(result);
  root.render(<ReviewProposal key={crypto.randomUUID()} result={value} back={() => {}} />);
}
Object.assign(window, { rt07Mount: mount, rt07Capture(text: string) {
  const parsed = parseCaptureFixture(id(1), text);
  const result = {
    version: 1, environment: 'synthetic_demo', captureId: id(2), jobId: id(3), proposalId: id(4), reviewId: id(5),
    status: 'draft', source: { text, version: 1, kind: 'browser_local_transcript', acquisition: null, audioByteLength: 0 },
    proposal: { title: parsed.title.value, lines: parsed.lines.map((line, index) => ({
      ...line, id: id(10 + index), scopeItemId: id(100 + index), room: 'Whole job', category: 'Other',
      sourceExcerpt: text.slice(line.description.provenance.kind === 'extracted' ? line.description.provenance.span.start : 0,
        line.description.provenance.kind === 'extracted' ? line.description.provenance.span.end : text.length),
    })), questions: parsed.questions }, review: null,
  };
  mount(result);
  return result;
} });
