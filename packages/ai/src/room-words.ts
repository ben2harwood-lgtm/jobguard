// The room words both the capture parser and Reader A (context-reader.ts) read, in one place so neither imports the other.
const ROOM = "en[\\s-]?suite|ensuite|living room|dining room|utility room|utility|kitchen|bathroom|wc|cloakroom|hallway|hall|landing|stairs|staircase|lounge|bedroom|loft|garage|garden|roof|extension|conservatory|porch|office|study";
const QUALIFIER = "upstairs|downstairs|front|back|master|main|spare|small|big|kids|other|top|first|second|third|fourth";
/** "bedroom two", "bedroom 3": an ordinal only after "bedroom", and never the start of an amount or a count of coats. */
const ORDINAL = "(?:one|two|three|four|five|[1-5])(?![\\d.,]|\\s*(?:k|grand|pounds|quid|hundred|thousand|coats?|of)\\b)";
export const roomPart = `(?:(?:${QUALIFIER})\\s+)?(?:bedroom\\s+${ORDINAL}|${ROOM})(?:\\s+(?:upstairs|downstairs)(?![\\p{L}]))?`;
/** "In the kitchen rip out …", "Upstairs bathroom strip out", "then the hallway paint …": the room words before the work. */
export const roomLead = "(?:(?:right|ok|okay|so|um|er|well)[\\s,]+)*(?:(?:and\\s+)?(?:then\\s+)?(?:(?:in|on|up on|at)\\s+)?(?:the\\s+)?|out the\\s+)";
/** A clause that only names a room ("In the kitchen", "Upstairs bathroom", "Out the back"): it opens the room for what follows. */
export const roomOnly = new RegExp(`^${roomLead}(${roomPart}(?:\\s+and\\s+(?:the\\s+)?${roomPart})?|back|front)[\\s,:-]*$`, "iu");
/**
 * "Bedroom two £500", "bedroom 2 500 pounds": the ordinal names the room, so the amount reader and its guards must not
 * see it as a number beside the amount. Hidden only when a stated amount (£ or digits) follows; "bedroom two five
 * hundred pounds" is left as said and stays open. Same length, so every index into the text stays the same.
 */
const numberedRoom = /(?<![\p{L}])bedroom\s+(?:one|two|three|four|five|[1-5])(?=\s*£|\s+\d)/giu;
export function hideRoomNumbers(text: string): string {
  return text.replace(numberedRoom, room => room.replace(/(?:one|two|three|four|five|[1-5])$/iu, ordinal => " ".repeat(ordinal.length)));
}
