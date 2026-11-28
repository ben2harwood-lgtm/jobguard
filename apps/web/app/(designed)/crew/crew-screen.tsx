"use client";

import { Card, Empty, Note, Screen, Shell } from "../designed-ui";
import { CrewAddForm, useCrewContacts } from "./crew-contacts";

// V2-C3C-UI: "Your crew". The people who fix, check and do the work, so the work plan and snags can name them.
export function CrewList() {
  const { crew, failed } = useCrewContacts();
  return <Card title="Your crew" sub="The people you can give work to, and who can fix or check a snag." id="crew">
    {failed && !crew && <div className="card-body" role="alert"><Note tone="warning">Your crew could not load. Reload the page to try again.</Note></div>}
    {!crew && !failed && <p className="card-body" role="status">Loading your crew…</p>}
    {crew && !crew.length && <Empty title="No crew yet" text="Add the first person below."/>}
    {!!crew?.length && <div className="card-body crew-panel"><ul className="crew-list" aria-label="Crew">
      {crew.map(contact => <li key={contact.crewId}><strong>{contact.displayName}</strong><span>{contact.trade}</span></li>)}
    </ul></div>}
    <div className="card-body">
      <h3>Add someone</h3>
      <CrewAddForm/>
      <Note>Practice only. Use made-up details: nothing is sent to these numbers or addresses.</Note>
    </div>
  </Card>;
}

export function CrewScreen() {
  return <Screen title="Your crew." active="more">{workspace =>
    <Shell workspace={workspace} title="Your crew." subtitle="Add the people who work with you, then give them tasks on a job's plan." active="more">
      <CrewList/>
    </Shell>}
  </Screen>;
}
