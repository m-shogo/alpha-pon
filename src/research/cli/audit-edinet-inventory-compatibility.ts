import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildEdinetInventoryCompatibilityAudit,
  renderEdinetInventoryCompatibilityAudit,
} from "../edinet-inventory-compatibility-audit.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function localRoot(): string {
  return resolve(process.cwd(), "data/edinet");
}

function validateInventoryPath(input: string | null, field: string): string {
  if (!input?.trim()) throw new Error(`--${field} is required`);
  const path = resolve(process.cwd(), input.trim());
  const root = localRoot();
  if (dirname(path) !== root || !basename(path).endsWith(".json")) {
    throw new Error(`${field} inventory must be a direct JSON child of data/edinet`);
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${field} inventory must be a regular non-symlink file`);
  return path;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} inventory is not valid JSON`);
  }
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function writeExclusive(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function main(): void {
  const legacyPath = validateInventoryPath(argValue("legacy"), "legacy");
  const configuredPath = validateInventoryPath(argValue("configured"), "configured");
  if (legacyPath === configuredPath) throw new Error("legacy and configured inventory paths must differ");
  const generatedAt = new Date();
  const audit = buildEdinetInventoryCompatibilityAudit({
    legacyInventory: parseJson(legacyPath, "legacy"),
    configuredInventory: parseJson(configuredPath, "configured"),
    legacyInventoryFile: basename(legacyPath),
    configuredInventoryFile: basename(configuredPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(localRoot(), `sanrio-edinet-inventory-compatibility-v1.${token}.json`);
  const markdownPath = resolve(localRoot(), `sanrio-edinet-inventory-compatibility-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeExclusive(markdownPath, renderEdinetInventoryCompatibilityAudit(audit));

  console.log("EDINET inventory compatibility audit");
  console.log(`legacy: ${legacyPath}`);
  console.log(`configured: ${configuredPath}`);
  console.log(`range match: ${audit.rangeMatch}`);
  console.log(`completeness match: ${audit.completenessMatch}`);
  console.log(`candidate counts: legacy=${audit.legacyCandidateCount}, configured=${audit.configuredCandidateCount}`);
  console.log(`matched: ${audit.matchedCandidateCount}`);
  console.log(`mismatch: ${audit.mismatchCandidateCount}`);
  console.log(`legacy only: ${audit.legacyOnlyCandidateCount}`);
  console.log(`configured only: ${audit.configuredOnlyCandidateCount}`);
  console.log(`equivalent core candidate set: ${audit.equivalentCoreCandidateSet}`);
  console.log(`migration ready for human review: ${audit.migrationReadyForHumanReview}`);
  console.log(`audit report: ${jsonPath}`);
  console.log(`audit review: ${markdownPath}`);
  console.log(`auditHash: ${audit.auditHash}`);
  console.log("replacementAuthorized: false");
  console.log("appendAuthorized: false");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown inventory compatibility audit error";
  console.error(`EDINET inventory compatibility audit failed: ${message}`);
  process.exitCode = 1;
}
