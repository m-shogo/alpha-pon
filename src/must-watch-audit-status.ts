export type MustWatchAuditStatusInput = {
  missingEntities: readonly unknown[];
  missingJapanLinks: readonly unknown[];
  missingQuestions: readonly unknown[];
  missingSafetyRules: readonly unknown[];
};

export function mustWatchThemeStatus(input: MustWatchAuditStatusInput): "ok" | "warning" {
  return input.missingEntities.length === 0
    && input.missingJapanLinks.length === 0
    && input.missingQuestions.length === 0
    && input.missingSafetyRules.length === 0
    ? "ok"
    : "warning";
}
