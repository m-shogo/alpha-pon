export function assertFirstExecutableAtAfterRetrievalStart(
  firstExecutableAt: string,
  retrievalStartedAt: Date,
): void {
  const executableMs = Date.parse(firstExecutableAt);
  const retrievalMs = retrievalStartedAt.getTime();
  if (!Number.isFinite(executableMs)) {
    throw new Error("--first-executable-at must be an ISO-8601 timestamp");
  }
  if (!Number.isFinite(retrievalMs)) {
    throw new Error("retrieval start must be a valid timestamp");
  }
  if (executableMs < retrievalMs) {
    throw new Error("--first-executable-at must be at or after retrieval start");
  }
}
