import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildEdinetLocalReviewDashboard,
  renderEdinetLocalReviewDashboardHtml,
  type EdinetDashboardArtifactInput,
} from "../edinet-local-review-dashboard.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

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

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

function validateAcquisitionDirectory(path: string): string {
  const root = localRoot();
  if (
    dirname(path) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(path))
  ) {
    throw new Error("acquisition must be a direct data/edinet/sanrio-acquisition.* directory");
  }
  assertDirectory(path, "acquisition directory");
  return path;
}

function resolveAcquisitionDirectory(input: string | null): string {
  if (input?.trim()) return validateAcquisitionDirectory(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  assertDirectory(root, "EDINET root");
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(entry.name))
    .map(entry => {
      const path = resolve(root, entry.name);
      const stat = lstatSync(path);
      return stat.isSymbolicLink() ? null : { path, mtimeMs: stat.mtimeMs };
    })
    .filter((value): value is { path: string; mtimeMs: number } => value !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio acquisition directory found under data/edinet");
  return validateAcquisitionDirectory(latest.path);
}

function parseArtifact(
  path: string,
  location: EdinetDashboardArtifactInput["location"],
): { artifact: EdinetDashboardArtifactInput; bytes: number } | null {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) return null;
  if (stat.size <= 0 || stat.size > MAX_FILE_BYTES) return null;
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
  return {
    artifact: {
      fileName: basename(path),
      content,
      modifiedAt: stat.mtime.toISOString(),
      location,
    },
    bytes: stat.size,
  };
}

function collectArtifacts(acquisitionDirectory: string): EdinetDashboardArtifactInput[] {
  const root = localRoot();
  const artifacts: EdinetDashboardArtifactInput[] = [];
  let totalBytes = 0;

  const locations: Array<{
    directory: string;
    location: EdinetDashboardArtifactInput["location"];
  }> = [
    { directory: acquisitionDirectory, location: "acquisition" },
    { directory: root, location: "root" },
  ];

  for (const { directory, location } of locations) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const parsed = parseArtifact(resolve(directory, entry.name), location);
      if (!parsed) continue;
      totalBytes += parsed.bytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("dashboard JSON input exceeds total byte limit");
      }
      artifacts.push(parsed.artifact);
    }
  }
  return artifacts;
}

function timestampToken(date: Date): string {
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
  const acquisitionDirectory = resolveAcquisitionDirectory(argValue("acquisition"));
  const generatedAt = new Date();
  const dashboard = buildEdinetLocalReviewDashboard({
    acquisitionDirectory: basename(acquisitionDirectory),
    artifacts: collectArtifacts(acquisitionDirectory),
    generatedAt: generatedAt.toISOString(),
  });
  const token = timestampToken(generatedAt);
  const jsonPath = resolve(acquisitionDirectory, `edinet-local-review-dashboard-v1.${token}.json`);
  const htmlPath = resolve(acquisitionDirectory, `edinet-local-review-dashboard-v1.${token}.html`);
  writeExclusive(jsonPath, `${JSON.stringify(dashboard, null, 2)}\n`);
  writeExclusive(htmlPath, renderEdinetLocalReviewDashboardHtml(dashboard));

  console.log("EDINET local review dashboard");
  console.log(`acquisition: ${acquisitionDirectory}`);
  console.log(`recognized artifacts: ${dashboard.recognizedArtifactCount}`);
  console.log(`latest stages: ${dashboard.latestStageCount}`);
  console.log(`verified artifacts: ${dashboard.verifiedArtifactCount}`);
  console.log(`invalid integrity: ${dashboard.invalidIntegrityCount}`);
  console.log(`unsafe boundaries: ${dashboard.unsafeBoundaryCount}`);
  console.log(`pending human review: ${dashboard.pendingHumanReviewCount}`);
  console.log(`dashboard status: ${dashboard.dashboardStatus}`);
  console.log(`dashboard JSON: ${jsonPath}`);
  console.log(`dashboard HTML: ${htmlPath}`);
  console.log(`dashboardHash: ${dashboard.dashboardHash}`);
  console.log("readOnly: true");
  console.log("appendAuthorized: false");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown EDINET dashboard error";
  console.error(`EDINET local review dashboard failed: ${message}`);
  process.exitCode = 1;
}
