import { lstatSync } from "node:fs";
import { join } from "node:path";
import { backupAgeDaysFromDirectoryName } from "../date.js";

export type BackupHealthEvidence = {
  count: number;
  latest: string | null;
  latestAgeDays: number | null;
};

function isCanonicalBackupDirectory(root: string, name: string): boolean {
  try {
    return lstatSync(join(root, name)).isDirectory();
  } catch {
    return false;
  }
}

export function backupHealthEvidenceFromDirectoryNames(
  names: string[],
  now = new Date(),
  root = "backups",
): BackupHealthEvidence {
  const valid = names
    .filter((name) => isCanonicalBackupDirectory(root, name))
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
