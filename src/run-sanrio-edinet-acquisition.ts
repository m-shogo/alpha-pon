import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
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
  buildSanrioEdinetAcquisitionPlan,
  type SanrioAcquisitionTask,
} from "./fetcher/edinet-sanrio-acquisition.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function localRoot(): string {
  const root = resolve(process.cwd(), "data/edinet");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function resolveInventoryPath(input: string): string {
  const root = localRoot();
  const target = resolve(process.cwd(), input);
  if (dirname(target) !== root || !basename(target).endsWith(".json")) {
    throw new Error("inventory must be a direct JSON child of data/edinet");
  }
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("inventory must be a regular non-symlink file");
  }
  return target;
}

function latestInventoryPath(): string {
  const root = localRoot();
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^sanrio-edinet-inventory\..+\.json$/.test(entry.name))
    .map(entry => {
      const path = resolve(root, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) return null;
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .filter((value): value is { path: string; mtimeMs: number } => value !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));

  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio EDINET inventory found under data/edinet");
  return latest.path;
}

function parseStrictJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`invalid inventory JSON: ${path}`);
  }
}

function safeStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function createOutputDirectory(now: Date): string {
  const target = resolve(localRoot(), `sanrio-acquisition.${safeStamp(now)}`);
  mkdirSync(target, { recursive: false, mode: 0o700 });
  return target;
}

function writeExclusiveDurable(path: string, value: Uint8Array | string): void {
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
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return number;
}

function nonNegativeNumber(value: string | undefined, fallback: number, field: string): number {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return number;
}

function failureCode(error: unknown): string {
  if (error instanceof EdinetDocumentTooLargeError) return error.code;
  if (error instanceof EdinetApiError) {
    return error.status === 0 ? "network_error" : `http_${error.status}`;
  }
  return "unexpected_error";
}

async function acquireTask(
  task: SanrioAcquisitionTask,
  outputDirectory: string,
  maxBytes: number,
): Promise<{
  task: SanrioAcquisitionTask;
  binaryFile: string;
  metadataFile: string;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
}> {
  const document = await fetchEdinetDocument(task.docID, task.documentType, { maxBytes });
  const stem = `${document.docID}.type-${document.documentType}.${document.sha256.slice(0, 16)}`;
  const binaryFile = `${stem}.${task.format}`;
  const metadataFile = `${stem}.metadata.json`;

  writeExclusiveDurable(resolve(outputDirectory, binaryFile), document.bytes);
  writeExclusiveDurable(
    resolve(outputDirectory, metadataFile),
    `${JSON.stringify({
      schemaVersion: 1,
      source: "edinet",
      docID: document.docID,
      documentType: document.documentType,
      format: task.format,
      reason: task.reason,
      sourceDocID: task.sourceDocID,
      parentOutsideInventory: task.parentOutsideInventory,
      byteLength: document.byteLength,
      sha256: document.sha256,
      contentType: document.contentType,
      contentDisposition: document.contentDisposition,
      retrievedAt: document.retrievedAt,
      sourceEndpoint: document.sourceEndpoint,
      storageBoundary: "local_only",
      appendAuthorized: false,
    }, null, 2)}\n`,
  );

  return {
    task,
    binaryFile,
    metadataFile,
    sha256: document.sha256,
    byteLength: document.byteLength,
    retrievedAt: document.retrievedAt,
  };
}

async function main(): Promise<void> {
  const status = getEdinetConfigurationStatus();
  if (!status.configured) throw new EdinetCredentialsMissingError();

  const inventoryPath = argValue("inventory")?.trim()
    ? resolveInventoryPath(argValue("inventory")!.trim())
    : latestInventoryPath();
  const inventory = parseStrictJson(inventoryPath);
  const plan = buildSanrioEdinetAcquisitionPlan(inventory);
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
  const outputDirectory = createOutputDirectory(startedAt);

  console.log("Sanrio EDINET local batch acquisition");
  console.log(`inventory: ${basename(inventoryPath)}`);
  console.log(`tasks: ${plan.tasks.length}`);
  console.log("credential: configured (value is never printed)");
  console.log(`output: data/edinet/${basename(outputDirectory)}`);

  const succeeded: Awaited<ReturnType<typeof acquireTask>>[] = [];
  const failed: Array<{ task: SanrioAcquisitionTask; code: string }> = [];

  for (let index = 0; index < plan.tasks.length; index++) {
    const current = plan.tasks[index]!;
    process.stdout.write(
      `[${index + 1}/${plan.tasks.length}] ${current.docID} type=${current.documentType} ... `,
    );
    try {
      const result = await acquireTask(current, outputDirectory, maxBytes);
      succeeded.push(result);
      console.log(`ok ${result.byteLength} bytes ${result.sha256.slice(0, 16)}`);
    } catch (error) {
      const code = failureCode(error);
      failed.push({ task: current, code });
      console.log(`failed ${code}`);
    }
    if (index < plan.tasks.length - 1 && delayMs > 0) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
    }
  }

  const manifest = {
    schemaVersion: 1,
    source: "edinet",
    issuer: plan.issuer,
    sourceInventory: basename(inventoryPath),
    sourceInventoryRange: plan.sourceInventoryRange,
    generatedAt: new Date().toISOString(),
    outputDirectory: basename(outputDirectory),
    totalTasks: plan.tasks.length,
    succeeded,
    failed,
    complete: failed.length === 0,
    storageBoundary: "local_only",
    appendAuthorized: false,
  };
  const manifestPath = resolve(outputDirectory, "acquisition-manifest.json");
  writeExclusiveDurable(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("");
  console.log(`succeeded: ${succeeded.length}`);
  console.log(`failed: ${failed.length}`);
  console.log(`manifest: data/edinet/${basename(outputDirectory)}/acquisition-manifest.json`);
  console.log("appendAuthorized: false");

  if (failed.length > 0) process.exitCode = 2;
}

main().catch(error => {
  if (error instanceof EdinetCredentialsMissingError) {
    console.error(`EDINET: credentials_missing (${EDINET_API_KEY_ENV})`);
    console.error("Keep the key only in local .env; never paste it into chat or GitHub.");
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.message : "unknown EDINET batch error";
  console.error(`Sanrio EDINET batch acquisition failed: ${message}`);
  process.exitCode = 1;
});
