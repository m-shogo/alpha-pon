import { backupAgeDaysFromDirectoryName } from "../date.js";

export type BackupHealthEvidence = {
  count: number;
  latest: string | null;
  latestAgeDays: number | null;
};

export function backupHealthEvidenceFromDirectoryNames(
  names: string[],
  now = new Date(),
): BackupHealthEvidence {
  const valid = names
    .map((name) => ({ name, ageDays: backupAgeDaysFromDirectoryName(name, now) }))
    .filter((entry): entry is { name: string; ageDays: number } => entry.ageDays !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const latest = valid.at(-1) ?? null;
  return {
    count: valid.length,
    latest: latest?.name ?? null,
    latestAgeDays: latest?.ageDays ?? null,
  };
}
