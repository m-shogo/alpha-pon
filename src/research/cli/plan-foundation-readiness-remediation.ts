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
  buildFoundationReadinessRemediationPlan,
  renderFoundationReadinessRemediationPlan,
} from "../foundation-readiness-remediation-plan.js";

const MAX_JSON_BYTES = 30 * 1024 * 1024;

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
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${field} must be a regular non-symlink file`);
}

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${field} must be a regular non-symlink directory`);
}

function resolveAuditPath(input: string): string {
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^configured-foundation-readiness-audit-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error(
      "audit must be data/edinet/<issuerKey>-acquisition.*/configured-foundation-readiness-audit-v1.*.json",
    );
  }
  assertDirectory(directory, "audit directory");
  assertRegularNonSymlink(path, "readiness audit");
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_JSON_BYTES) throw new Error("readiness audit size is invalid");
  return path;
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error("readiness audit is not valid JSON");
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
  const input = argValue("audit")?.trim();
  if (!input) throw new Error("--audit is required");
  if (!hasFlag("execute-remediation-plan")) {
    throw new Error("--execute-remediation-plan is required; no plan was generated");
  }
  const auditPath = resolveAuditPath(input);
  const generatedAt = new Date();
  const plan = buildFoundationReadinessRemediationPlan({
    readinessAudit: parseJson(auditPath),
    sourceAuditFile: basename(auditPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const directory = dirname(auditPath);
  const jsonPath = resolve(directory, `foundation-readiness-remediation-plan-v1.${token}.json`);
  const markdownPath = resolve(directory, `foundation-readiness-remediation-plan-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);
  writeExclusive(markdownPath, renderFoundationReadinessRemediationPlan(plan));

  console.log("Foundation readiness remediation plan");
  console.log(`issuer: ${plan.issuer.issuerKey}`);
  console.log(`steps: ${plan.stepCount}`);
  console.log(`pending fields: ${plan.pendingFieldCount}`);
  console.log(`plan: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`planHash: ${plan.planHash}`);
  console.log(`planStatus: ${plan.planStatus}`);
  console.log(`foundationMappingGateAuthorized: ${plan.foundationMappingGateAuthorized}`);
  console.log(`appendAuthorized: ${plan.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation remediation plan error";
  console.error(`Foundation readiness remediation plan failed: ${message}`);
  process.exitCode = 1;
}
