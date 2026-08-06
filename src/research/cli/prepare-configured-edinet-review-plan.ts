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
  buildConfiguredEdinetReviewPlan,
  renderConfiguredEdinetReviewPlan,
} from "../edinet-configured-review-plan.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function inventoryPath(): string {
  const input = argValue("inventory")?.trim();
  if (!input) throw new Error("--inventory is required");
  const path = resolve(process.cwd(), input);
  const root = resolve(process.cwd(), "data/edinet");
  if (dirname(path) !== root || !basename(path).endsWith(".json")) {
    throw new Error("inventory must be a direct JSON child of data/edinet");
  }
  assertRegularNonSymlink(path, "inventory");
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
  const inventory = inventoryPath();
  const registry = registryPath();
  const generatedAt = new Date();
  const plan = buildConfiguredEdinetReviewPlan({
    inventory: parseJson(inventory, "inventory"),
    registry: parseJson(registry, "registry"),
    sourceInventoryFile: basename(inventory),
    generatedAt: generatedAt.toISOString(),
  });
  const root = dirname(inventory);
  const token = stamp(generatedAt);
  const prefix = `${plan.issuer.issuerKey}-edinet-configured-review-plan-v1.${token}`;
  const jsonPath = resolve(root, `${prefix}.json`);
  const markdownPath = resolve(root, `${prefix}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetReviewPlan(plan));

  console.log("Configured EDINET review plan");
  console.log(`issuer: ${plan.issuer.issuerKey} (${plan.issuer.edinetCode}/${plan.issuer.secCode})`);
  console.log(`inventory: ${inventory}`);
  console.log(`registry: ${registry}`);
  console.log(`candidates/groups: ${plan.candidateCount}/${plan.groupCount}`);
  console.log(`planned acquisitions: ${plan.plannedAcquisitionCount}`);
  console.log(`type 1/type 2 candidates: ${plan.structuredDocumentPlanCount}/${plan.officialPdfPlanCount}`);
  console.log(`review plan: ${jsonPath}`);
  console.log(`review guide: ${markdownPath}`);
  console.log(`reviewPlanHash: ${plan.reviewPlanHash}`);
  console.log(`reviewStatus: ${plan.reviewStatus}`);
  console.log(`acquisitionAuthorized: ${plan.acquisitionAuthorized}`);
  console.log(`appendAuthorized: ${plan.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown configured review plan error";
  console.error(`Configured EDINET review plan failed: ${message}`);
  process.exitCode = 1;
}
