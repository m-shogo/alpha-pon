import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertEdinetDocumentTypeAllowed,
  buildEdinetIssuerRegistry,
  buildIssuerBoundaryEvidence,
  resolveEdinetIssuerBoundary,
} from "../edinet-issuer-boundary.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function registryPath(): string {
  const explicit = argValue("registry")?.trim();
  const path = resolve(process.cwd(), explicit || "config/research/edinet-issuer-registry.v1.json");
  const expectedRoot = resolve(process.cwd(), "config/research");
  if (!path.startsWith(`${expectedRoot}/`) || !path.endsWith(".json")) {
    throw new Error("issuer registry must be a JSON file under config/research");
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("issuer registry must be a regular non-symlink file");
  }
  return path;
}

function main(): void {
  const path = registryPath();
  const registry = buildEdinetIssuerRegistry(JSON.parse(readFileSync(path, "utf-8")) as unknown);
  const requestedIssuer = argValue("issuer");
  const selected = requestedIssuer?.trim()
    ? [resolveEdinetIssuerBoundary(registry, requestedIssuer.trim())]
    : registry.issuers.filter(issuer => issuer.active);
  for (const issuer of selected) {
    for (const documentType of issuer.allowedDocumentTypes) {
      assertEdinetDocumentTypeAllowed(issuer, documentType);
    }
  }

  console.log("EDINET issuer registry audit");
  console.log(`registry: ${path}`);
  console.log(`issuer count: ${registry.issuerCount}`);
  console.log(`active issuer count: ${registry.issuers.filter(issuer => issuer.active).length}`);
  console.log(`registryHash: ${registry.registryHash}`);
  for (const issuer of selected) {
    const evidence = buildIssuerBoundaryEvidence(issuer);
    console.log(`issuer: ${issuer.issuerKey}`);
    console.log(`  name: ${issuer.name}`);
    console.log(`  edinetCode/secCode: ${issuer.edinetCode}/${issuer.secCode}`);
    console.log(`  allowed document types: ${issuer.allowedDocumentTypes.join(",")}`);
    console.log(`  storagePolicy: ${issuer.storagePolicy}`);
    console.log(`  factPromotionPolicy: ${issuer.factPromotionPolicy}`);
    console.log(`  requireOfficialPdfVisualReview: ${issuer.requireOfficialPdfVisualReview}`);
    console.log(`  boundaryHash: ${evidence.boundaryHash}`);
  }
  console.log("automatic fact promotion: disabled");
  console.log("audit: ok");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown issuer registry error";
  console.error(`EDINET issuer registry audit failed: ${message}`);
  process.exitCode = 1;
}
