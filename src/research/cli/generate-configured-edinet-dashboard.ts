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
  buildConfiguredEdinetDashboard,
  renderConfiguredEdinetDashboardHtml,
} from "../edinet-configured-dashboard.js";

type JsonObject = Record<string, unknown>;

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

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function localBasename(value: unknown, field: string): string {
  const result = text(value);
  if (!result || result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function workspacePath(): string {
  const input = argValue("workspace")?.trim();
  if (!input) throw new Error("--workspace is required");
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || basename(path) !== "configured-review-workspace-v2.json"
  ) {
    throw new Error("workspace must be data/edinet/<issuerKey>-acquisition.*/configured-review-workspace-v2.json");
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, "configured review workspace");
  return path;
}

function registryPath(): string {
  const input = argValue("registry")?.trim() || "config/research/edinet-issuer-registry.v1.json";
  const path = resolve(process.cwd(), input);
  const root = resolve(process.cwd(), "config/research");
  if (!path.startsWith(`${root}/`) || !path.endsWith(".json")) {
    throw new Error("registry must be a JSON file under config/research");
  }
  assertRegularNonSymlink(path, "registry");
  return path;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function rootChild(file: unknown, field: string): string {
  const name = localBasename(file, field);
  const path = resolve(localRoot(), name);
  if (dirname(path) !== localRoot()) throw new Error(`${field} escaped EDINET root`);
  assertRegularNonSymlink(path, field);
  return path;
}

function directoryChild(directory: string, file: unknown, field: string): string {
  const name = localBasename(file, field);
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  assertRegularNonSymlink(path, field);
  return path;
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
  const sourceWorkspacePath = workspacePath();
  const directory = dirname(sourceWorkspacePath);
  const sourceRegistryPath = registryPath();
  const workspace = object(parseJson(sourceWorkspacePath, "review workspace"), "review workspace");
  const reviewPlanPath = rootChild(workspace.sourceReviewPlanFile, "source review plan");
  const acquisitionPlanPath = directoryChild(directory, workspace.sourceAcquisitionPlanFile, "source acquisition plan");
  const manifestPath = directoryChild(directory, workspace.acquisitionManifestFile, "acquisition manifest");
  const reviewPlan = object(parseJson(reviewPlanPath, "review plan"), "review plan");
  const inventoryPath = rootChild(reviewPlan.sourceInventoryFile, "source inventory");
  const dashboard = buildConfiguredEdinetDashboard({
    registry: parseJson(sourceRegistryPath, "registry"),
    inventory: parseJson(inventoryPath, "inventory"),
    reviewPlan,
    acquisitionPlan: parseJson(acquisitionPlanPath, "acquisition plan"),
    acquisitionManifest: parseJson(manifestPath, "acquisition manifest"),
    reviewWorkspace: workspace,
    files: {
      inventory: basename(inventoryPath),
      reviewPlan: basename(reviewPlanPath),
      acquisitionPlan: basename(acquisitionPlanPath),
      acquisitionManifest: basename(manifestPath),
      reviewWorkspace: basename(sourceWorkspacePath),
    },
  });
  const jsonPath = resolve(directory, "configured-pipeline-dashboard-v1.json");
  const htmlPath = resolve(directory, "configured-pipeline-dashboard-v1.html");
  writeExclusive(jsonPath, `${JSON.stringify(dashboard, null, 2)}\n`);
  writeExclusive(htmlPath, renderConfiguredEdinetDashboardHtml(dashboard));

  console.log("Configured EDINET pipeline dashboard");
  console.log(`issuer: ${dashboard.issuer.issuerKey} (${dashboard.issuer.edinetCode}/${dashboard.issuer.secCode})`);
  console.log(`verified stages: ${dashboard.verifiedStageCount}/${dashboard.stages.length}`);
  console.log(`integrity failures: ${dashboard.invalidIntegrityCount}`);
  console.log(`lineage failures: ${dashboard.lineageIssueCount}`);
  console.log(`safety failures: ${dashboard.unsafeBoundaryCount}`);
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
  const message = error instanceof Error ? error.message : "unknown configured dashboard error";
  console.error(`Configured EDINET dashboard failed: ${message}`);
  process.exitCode = 1;
}
