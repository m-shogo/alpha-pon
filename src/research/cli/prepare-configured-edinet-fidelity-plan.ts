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
  buildConfiguredEdinetFidelityPlan,
  renderConfiguredEdinetFidelityPlan,
} from "../edinet-configured-fidelity-plan.js";

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
  const sourceWorkspacePath = workspacePath();
  const sourceRegistryPath = registryPath();
  const generatedAt = new Date();
  const plan = buildConfiguredEdinetFidelityPlan({
    registry: parseJson(sourceRegistryPath, "registry"),
    reviewWorkspace: parseJson(sourceWorkspacePath, "configured review workspace"),
    sourceReviewWorkspaceFile: basename(sourceWorkspacePath),
    generatedAt: generatedAt.toISOString(),
  });
  const directory = dirname(sourceWorkspacePath);
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `configured-source-fidelity-plan-v1.${token}.json`);
  const markdownPath = resolve(directory, `configured-source-fidelity-plan-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetFidelityPlan(plan));

  console.log("Configured EDINET source-fidelity plan");
  console.log(`issuer: ${plan.issuer.issuerKey} (${plan.issuer.edinetCode}/${plan.issuer.secCode})`);
  console.log(`workspace: ${sourceWorkspacePath}`);
  console.log(`document pairs: ${plan.documentPairCount}`);
  console.log(`anchors: ${plan.anchorCount}`);
  console.log(`anchor input: ${plan.anchorInputStatus}`);
  console.log(`extraction: ${plan.extractionStatus}`);
  console.log(`plan: ${jsonPath}`);
  console.log(`review guide: ${markdownPath}`);
  console.log(`fidelityPlanHash: ${plan.fidelityPlanHash}`);
  console.log(`reviewStatus: ${plan.reviewStatus}`);
  console.log(`automaticExtractionAuthorized: ${plan.automaticExtractionAuthorized}`);
  console.log(`foundationPreviewEligible: ${plan.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${plan.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown configured fidelity plan error";
  console.error(`Configured EDINET fidelity plan failed: ${message}`);
  process.exitCode = 1;
}
