import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildConfiguredEdinetExactComparisonReport,
  renderConfiguredEdinetExactComparisonReport,
} from "../edinet-configured-exact-comparison.js";

const MAX_ANCHOR_FINAL_BYTES = 20 * 1024 * 1024;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function localRoot(): string {
  return resolve(process.cwd(), "data/edinet");
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

function anchorFinalPath(): string {
  const input = argValue("anchor-final")?.trim();
  if (!input) throw new Error("--anchor-final is required");
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^configured-fidelity-anchor-final-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("anchor final must be data/edinet/<issuerKey>-acquisition.*/configured-fidelity-anchor-final-v1.*.json");
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, "anchor final");
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_ANCHOR_FINAL_BYTES) {
    throw new Error("anchor final size is invalid");
  }
  return path;
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error("anchor final is not valid JSON");
  }
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

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function main(): void {
  if (!hasFlag("execute-exact-comparison")) {
    throw new Error("--execute-exact-comparison is required; no comparison was executed");
  }
  const sourcePath = anchorFinalPath();
  const directory = dirname(sourcePath);
  const generatedAt = new Date();
  const report = buildConfiguredEdinetExactComparisonReport({
    anchorFinal: parseJson(sourcePath),
    sourceAnchorFinalFile: basename(sourcePath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `configured-fidelity-exact-comparison-v1.${token}.json`);
  const markdownPath = resolve(directory, `configured-fidelity-exact-comparison-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetExactComparisonReport(report));

  console.log("Configured EDINET exact-normalized comparison");
  console.log(`issuer: ${report.issuer.issuerKey} (${report.issuer.edinetCode}/${report.issuer.secCode})`);
  console.log(`documents/anchors: ${report.documentCount}/${report.anchorCount}`);
  console.log(`exact normalized matches: ${report.exactNormalizedMatchCount}`);
  console.log(`mismatches pending visual review: ${report.mismatchPendingVisualReviewCount}`);
  console.log(`report: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`reportHash: ${report.reportHash}`);
  console.log(`reviewStatus: ${report.reviewStatus}`);
  console.log(`fuzzyMatchingUsed: ${report.fuzzyMatchingUsed}`);
  console.log(`semanticEquivalenceInferred: ${report.semanticEquivalenceInferred}`);
  console.log(`officialPdfVisualReviewComplete: ${report.officialPdfVisualReviewComplete}`);
  console.log(`foundationPreviewEligible: ${report.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${report.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown exact comparison error";
  console.error(`Configured EDINET exact comparison failed: ${message}`);
  process.exitCode = 1;
}
