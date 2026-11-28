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
