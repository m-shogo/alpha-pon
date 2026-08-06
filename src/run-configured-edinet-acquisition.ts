import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  EDINET_API_KEY_ENV,
  EdinetApiError,
  EdinetCredentialsMissingError,
  getEdinetConfigurationStatus,
} from "./fetcher/edinet.js";
import {
  EdinetDocumentTooLargeError,
  fetchEdinetDocument,
} from "./fetcher/edinet-document.js";
import {
  buildConfiguredEdinetAcquisitionAttempt,
  buildConfiguredEdinetAcquisitionManifest,
  buildConfiguredEdinetAcquisitionPlan,
  type ConfiguredEdinetAcquisitionFailure,
  type ConfiguredEdinetAcquisitionSuccess,
  type ConfiguredEdinetAcquisitionTask,
} from "./fetcher/edinet-configured-acquisition.js";

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
  const root = resolve(process.cwd(), "data/edinet");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function reviewPlanPath(): string {
  const input = argValue("review-plan")?.trim();
  if (!input) throw new Error("--review-plan is required");
  const path = resolve(process.cwd(), input);
  const root = localRoot();
  if (dirname(path) !== root || !basename(path).endsWith(".json")) {
    throw new Error("review plan must be a direct JSON child of data/edinet");
  }
  assertRegularNonSymlink(path, "review plan");
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

function createOutputDirectory(issuerKey: string, now: Date): string {
  const target = resolve(localRoot(), `${issuerKey}-acquisition.${stamp(now)}`);
  mkdirSync(target, { recursive: false, mode: 0o700 });
  return target;
}

function writeExclusive(path: string, value: Uint8Array | string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, value);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function positiveNumber(value: string | undefined, fallback: number, field: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be positive`);
  return parsed;
}

function nonNegativeNumber(value: string | undefined, fallback: number, field: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be non-negative`);
  return parsed;
}

function failureCode(error: unknown): string {
  if (error instanceof EdinetDocumentTooLargeError) return error.code;
  if (error instanceof EdinetApiError) {
    return error.status === 0 ? "network_error" : `http_${error.status}`;
  }
  return "unexpected_error";
}

async function acquireTask(input: {
  task: ConfiguredEdinetAcquisitionTask;
  outputDirectory: string;
  maxBytes: number;
  registryHash: string;
  boundaryHash: string;
  issuerKey: string;
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  acquisitionPlanHash: string;
}): Promise<ConfiguredEdinetAcquisitionSuccess> {
  const document = await fetchEdinetDocument(
    input.task.docID,
    input.task.documentType,
    { maxBytes: input.maxBytes },
  );
  const stem = `${document.docID}.type-${document.documentType}.${document.sha256.slice(0, 16)}`;
  const binaryFile = `${stem}.${input.task.format}`;
  const metadataFile = `${stem}.metadata.json`;
  writeExclusive(resolve(input.outputDirectory, binaryFile), document.bytes);
  writeExclusive(
    resolve(input.outputDirectory, metadataFile),
    `${JSON.stringify({
      schemaVersion: 1,
      source: "edinet",
      registryHash: input.registryHash,
      issuerKey: input.issuerKey,
      boundaryHash: input.boundaryHash,
      sourceReviewPlanFile: input.sourceReviewPlanFile,
      sourceReviewPlanHash: input.sourceReviewPlanHash,
      acquisitionPlanHash: input.acquisitionPlanHash,
      docID: document.docID,
      documentType: document.documentType,
      format: input.task.format,
      reason: input.task.reason,
      sourceDocID: input.task.sourceDocID,
      parentOutsidePlan: input.task.parentOutsidePlan,
      byteLength: document.byteLength,
      sha256: document.sha256,
      contentType: document.contentType,
      contentDisposition: document.contentDisposition,
      retrievedAt: document.retrievedAt,
      sourceEndpoint: document.sourceEndpoint,
      executionMode: "explicit_local_command",
      storageBoundary: "local_only",
      appendAuthorized: false,
    }, null, 2)}\n`,
  );
  return {
    task: input.task,
    binaryFile,
    metadataFile,
    sha256: document.sha256,
    byteLength: document.byteLength,
    retrievedAt: document.retrievedAt,
  };
}

async function main(): Promise<void> {
  const sourceReviewPlanPath = reviewPlanPath();
  const sourceRegistryPath = registryPath();
  const plan = buildConfiguredEdinetAcquisitionPlan({
    reviewPlan: parseJson(sourceReviewPlanPath, "review plan"),
    registry: parseJson(sourceRegistryPath, "registry"),
    sourceReviewPlanFile: basename(sourceReviewPlanPath),
  });

  if (!hasFlag("execute-local-acquisition")) {
    throw new Error("explicit --execute-local-acquisition flag is required; no network request was made");
  }
  const status = getEdinetConfigurationStatus();
  if (!status.configured) throw new EdinetCredentialsMissingError();

  const maxBytes = positiveNumber(
    process.env.EDINET_DOCUMENT_MAX_BYTES,
    100 * 1024 * 1024,
    "EDINET_DOCUMENT_MAX_BYTES",
  );
  const delayMs = nonNegativeNumber(
    process.env.EDINET_ACQUISITION_DELAY_MS,
    500,
    "EDINET_ACQUISITION_DELAY_MS",
  );
  const startedAt = new Date();
  const outputDirectory = createOutputDirectory(plan.issuer.issuerKey, startedAt);
  writeExclusive(
    resolve(outputDirectory, "acquisition-plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
  );

  console.log("Configured EDINET explicit local acquisition");
  console.log(`issuer: ${plan.issuer.issuerKey} (${plan.issuer.edinetCode}/${plan.issuer.secCode})`);
  console.log(`review plan: ${basename(sourceReviewPlanPath)}`);
  console.log(`tasks: ${plan.taskCount}`);
  console.log("credential: configured (value is never printed)");
  console.log(`output: data/edinet/${basename(outputDirectory)}`);

  const succeeded: ConfiguredEdinetAcquisitionSuccess[] = [];
  const failed: ConfiguredEdinetAcquisitionFailure[] = [];
  for (let index = 0; index < plan.tasks.length; index++) {
    const task = plan.tasks[index]!;
    process.stdout.write(`[${index + 1}/${plan.taskCount}] ${task.docID} type=${task.documentType} ... `);
    try {
      const result = await acquireTask({
        task,
        outputDirectory,
        maxBytes,
        registryHash: plan.registryHash,
        boundaryHash: plan.issuer.boundaryHash,
        issuerKey: plan.issuer.issuerKey,
        sourceReviewPlanFile: plan.sourceReviewPlanFile,
        sourceReviewPlanHash: plan.sourceReviewPlanHash,
        acquisitionPlanHash: plan.planHash,
      });
      succeeded.push(result);
      console.log(`ok ${result.byteLength} bytes ${result.sha256.slice(0, 16)}`);
    } catch (error) {
      const code = failureCode(error);
      failed.push({ task, code });
      console.log(`failed ${code}`);
    }
    if (index < plan.tasks.length - 1 && delayMs > 0) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
    }
  }

  const generatedAt = new Date().toISOString();
  if (failed.length > 0) {
    const attempt = buildConfiguredEdinetAcquisitionAttempt({
      plan,
      generatedAt,
      outputDirectory: basename(outputDirectory),
      succeeded,
      failed,
    });
    writeExclusive(
      resolve(outputDirectory, "acquisition-attempt.json"),
      `${JSON.stringify(attempt, null, 2)}\n`,
    );
    console.error("");
    console.error(`succeeded: ${succeeded.length}`);
    console.error(`failed: ${failed.length}`);
    console.error(`attempt: data/edinet/${basename(outputDirectory)}/acquisition-attempt.json`);
    console.error("canonical acquisition-manifest.json: not written");
    console.error("appendAuthorized: false");
    process.exitCode = 2;
    return;
  }

  const manifest = buildConfiguredEdinetAcquisitionManifest({
    plan,
    generatedAt,
    outputDirectory: basename(outputDirectory),
    succeeded,
    failed,
  });
  writeExclusive(
    resolve(outputDirectory, "acquisition-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log("");
  console.log(`succeeded: ${succeeded.length}`);
  console.log("failed: 0");
  console.log(`manifest: data/edinet/${basename(outputDirectory)}/acquisition-manifest.json`);
  console.log(`manifestHash: ${manifest.manifestHash}`);
  console.log(`reviewStatus: ${manifest.reviewStatus}`);
  console.log("appendAuthorized: false");
}

main().catch(error => {
  if (error instanceof EdinetCredentialsMissingError) {
    console.error(`EDINET: credentials_missing (${EDINET_API_KEY_ENV})`);
    console.error("Keep the key only in local .env; never paste it into chat or GitHub.");
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.message : "unknown configured acquisition error";
  console.error(`Configured EDINET acquisition failed: ${message}`);
  process.exitCode = 1;
});
