export function hasUsableSourceHealthText(value: string): boolean {
  return value.trim().length > 0;
}

export function sourceHealthHistoryState(fileExists: boolean): "ok" | "missing" {
  return fileExists ? "ok" : "missing";
}
