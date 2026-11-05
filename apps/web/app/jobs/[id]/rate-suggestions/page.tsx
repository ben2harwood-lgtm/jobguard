import { rateSession, rateQuery } from "../../../lib/rate-suggestion-server";
import { RateSuggestionScreenView } from "./rate-suggestion-screen";
export const dynamic = "force-dynamic";
export default async function RateSuggestionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) throw new Error("Invalid query");
      if (value !== undefined) query.set(key, value);
    }
    const { application, token } = await rateSession();
    const screen = await application.read(token, (await params).id, rateQuery(query));
    return <main><RateSuggestionScreenView screen={screen} /></main>;
  } catch {
    return <main><h1>Practice rate suggestions</h1><p role="alert">This practice job or session is unavailable. Sign in with a current company owner membership and check the comparison details.</p></main>;
  }
}
