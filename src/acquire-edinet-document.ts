import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import {
  EdinetCredentialsMissingError,
  EDINET_API_KEY_ENV,
} from "./fetcher/edinet.js";
import {
  fetchEdinetDocument,
  type EdinetDocumentTypeCode,
} from "./fetcher/edinet-document.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`missing required argument --${name}`);
  return value;
}

function resolveLocalOutputDir(input: string | null): string {
  const allowedRoot = resolve(process.cwd(), "data/edinet");
  const target = resolve(process.cwd(), input?.trim() || "data/edinet");
  if (target !== allowedRoot && !target.startsWith(`${allowedRoot}${sep}`)) {
    throw new Error("EDINET documents must remain under local-only data/edinet");
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("EDINET output must be a regular local directory");
  }
  return target;
}

function writeExclusiveDurable(path: string, data: Uint8Array | string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function extensionForType(type: EdinetDocumentTypeCode): "pdf" | "zip" {
  return type === "2" ? "pdf" : "zip";
}

async function main(): Promise<void> {
  const docID = requiredArg("doc-id");
  const documentType = requiredArg("type");
  const outputDir = resolveLocalOutputDir(argValue("out-dir"));

  const document = await fetchEdinetDocument(docID, documentType);
  const extension = extensionForType(document.documentType);
  const stem = `${document.docID}.type-${document.documentType}.${document.sha256.slice(0, 16)}`;
  const binaryPath = resolve(outputDir, `${stem}.${extension}`);
  const metadataPath = resolve(outputDir, `${stem}.metadata.json`);

  writeExclusiveDurable(binaryPath, document.bytes);
  writeExclusiveDurable(
    metadataPath,
    `${JSON.stringify({
      schemaVersion: 1,
      source: "edinet",
      docID: document.docID,
      documentType: document.documentType,
      format: extension,
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

  console.log(`EDINET document acquired: ${document.docID}`);
  console.log(`type: ${document.documentType}`);
  console.log(`bytes: ${document.byteLength}`);
  console.log(`sha256: ${document.sha256}`);
  console.log(`binary: ${binaryPath}`);
  console.log(`metadata: ${metadataPath}`);
  console.log("appendAuthorized: false");
}

main().catch(error => {
  if (error instanceof EdinetCredentialsMissingError) {
    console.error(`EDINET: credentials_missing (${EDINET_API_KEY_ENV})`);
    console.error("Set the key only in the local .env file; do not paste it into chat or GitHub.");
    process.exitCode = 2;
    return;
  }

  const message = error instanceof Error ? error.message : "unknown EDINET acquisition error";
  console.error(`EDINET acquisition failed: ${message}`);
  process.exitCode = 1;
});
