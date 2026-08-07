export const SANRIO_LEGACY_HUMAN_REVIEW_FILENAME_PATTERN =
  /^revision-human-review-(?:decision|record)-v1\.[A-Za-z0-9_-]+\.json$/;

export function isSanrioLegacyHumanReviewFilename(name: string): boolean {
  return SANRIO_LEGACY_HUMAN_REVIEW_FILENAME_PATTERN.test(name);
}

export function canonicalSanrioLegacyHumanReviewFilenameKind(name: string): "decision" | "legacy_record" | null {
  if (/^revision-human-review-decision-v1\.[A-Za-z0-9_-]+\.json$/.test(name)) return "decision";
  if (/^revision-human-review-record-v1\.[A-Za-z0-9_-]+\.json$/.test(name)) return "legacy_record";
  return null;
}
