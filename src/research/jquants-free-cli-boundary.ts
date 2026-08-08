import { parseExplicitIso8601Instant } from "./iso-instant.js";

export { parseExplicitIso8601Instant } from "./iso-instant.js";

export function assertFirstExecutableAtAfterRetrievalStart(
  firstExecutableAt: string,
  retrievalStartedAt: Date,
): void {
  const executableMs = parseExplicitIso8601Instant(firstExecutableAt, "--first-executable-at");
  const retrievalMs = retrievalStartedAt.getTime();
  if (!Number.isFinite(retrievalMs)) {
    throw new Error("retrieval start must be a valid timestamp");
  }
  if (executableMs < retrievalMs) {
    throw new Error("--first-executable-at must be at or after retrieval start");
  }
}
