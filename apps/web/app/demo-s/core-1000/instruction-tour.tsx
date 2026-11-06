"use client";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { Walkthrough, type WalkthroughStep } from "../../ui/walkthrough/walkthrough";

const instructions = [
  { title: "Capture the work", words: "Start with made-up work and customer details. Checking the source lines keeps your quote tied to what you described. Open these instructions, then use the capture screen below." },
  { title: "Review and price", words: "Review each line and save the price you intend. Saved revisions preserve what changed. Open the pricing instructions to see the reference figures." },
  { title: "Send and accept", words: "Review the exact quote before simulated sending. Acceptance and starting a job are separate decisions. Open the instructions for the practice controls." },
  { title: "Agree extras", words: "Keep agreed extras separate from work still awaiting approval. Open the instructions for the additions and omission in this example." },
  { title: "Add proof", words: "Attach practice evidence and check its file integrity before completing the stage. The saved proof is linked to this stage of the job. Open the proof instructions." },
  { title: "Final Check", words: "Review and lock the account before running Final Check. Invoice issue waits for its saved result. Open the instructions for this prepared practice exercise." },
  { title: "Invoice and payment", words: "An invoice and a receipt are different saved facts. Open the instructions to practise payment and reversal without live money." },
  { title: "Correct the bill", words: "Use a credit note to correct a bill while keeping its history. Open the instructions for the exact correction." },
  { title: "Read the report", words: "Follow the value report's source links to inspect the records behind the figures. Open these instructions; finishing this guide tour does not mean the job is finished." },
];
export const coreGuideSteps: WalkthroughStep[] = instructions.map(({ title, words }, index) => ({
  id: `core-guide-${index}`, target: `#core-guide-${index} > summary`, title,
  words,
  isDone: () => document.querySelector<HTMLDetailsElement>(`#core-guide-${index}`)?.open === true,
  autoAction: target => { target.click(); },
}));
/** First consumer of WALK-1. WALK-3 binds the layer to the voice-first job's real actions. */
export function InstructionTour({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <p>This tour opens the guide instructions only. It does not complete job steps. Follow the real job screens below to do the work.</p>
    <button onClick={() => setOpen(true)}>Tour the core guide instructions</button>
    <ol>{Children.toArray(children).filter(isValidElement<{ children: ReactNode }>).map((child, index) =>
      <li key={instructions[index]?.title}><details id={`core-guide-${index}`} open={!open}><summary>{instructions[index]?.title}</summary>{child.props.children}</details></li>)}</ol>
    {open && <Walkthrough steps={coreGuideSteps} onClose={() => setOpen(false)} />}
  </>;
}
