import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { todayJst } from "./date.js";
import {
  EDINET_API_KEY_ENV,
  EdinetCredentialsMissingError,
  getEdinetConfigurationStatus,
} from "./fetcher/edinet.js";
import { scanConfiguredEdinetRange } from "./fetcher/edinet-configured-pilot.js";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
} from "./research/edinet-issuer-boundary.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function localRoot(): string {
  const root = resolve(process.cwd(), "data/edinet");
  mkdirSync(root, { recursive: true });
  return root;
}

function registryPath(): string {
  const input = argValue("registry")?.trim() || "config/research/edinet-issuer-registry.v1.json";
  const path = resolve(process.cwd(), input);
  const root = resolve(process.cwd(), "config/research");
  if (!path.startsWith(`${root}/`) || !path.endsWith(".json")) {
    throw new Error("issuer registry must be a JSON file under config/research");
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("issuer registry must be a regular non-symlink file");
  return path;
}

function safeStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function resolveOutputPath(
  input: string | null,
  issuerKey: string,
  from: string,
  to: string,
  now: Date,
): string {
  const root = localRoot();
  if (!input?.trim()) {
    return resolve(root, `${issuerKey}-edinet-inventory.${from}.${to}.${safeStamp(now)}.json`);
  }
  const target = resolve(process.cwd(), input.trim());
  if (dirname(target) !== root || !basename(target).endsWith(".json")) {
    throw new Error("output must be a direct JSON child of data/edinet");
  }
  return target;
}

function writeExclusiveDurable(path: string, value: unknown): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

async function main(): Promise<void> {
  const issuerIdentifier = argValue("issuer")?.trim();
  if (!issuerIdentifier) throw new Error("--issuer is required for configured EDINET pilot");
  const sourceRegistryPath = registryPath();
  const registry = buildEdinetIssuerRegistry(
    JSON.parse(readFileSync(sourceRegistryPath, "utf-8")) as unknown,
  );
  const boundary = resolveEdinetIssuerBoundary(registry, issuerIdentifier);

  const status = getEdinetConfigurationStatus();
  if (!status.configured) throw new EdinetCredentialsMissingError();

  const to = argValue("to")?.trim() || todayJst();
  const from = argValue("from")?.trim() || `${to.slice(0, 4)}-01-01`;
  const delayInput = argValue("delay-ms")?.trim() || process.env.EDINET_SCAN_DELAY_MS?.trim() || "300";
  const delayMs = Number(delayInput);
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60_000) {
    throw new Error("delay-ms must be between 0 and 60000");
  }

  const startedAt = new Date();
  console.log("Configured EDINET local inventory pilot");
  console.log(`issuer: ${boundary.issuerKey} (${boundary.edinetCode}/${boundary.secCode})`);
  console.log(`boundaryHash: ${boundary.boundaryHash}`);
  console.log(`registryHash: ${registry.registryHash}`);
  console.log(`range: ${from} .. ${to}`);
  console.log("mode: inventory_only");
  console.log("credential: configured (value is never printed)");

  const inventory = await scanConfiguredEdinetRange(from, to, {
    boundary,
    registryHash: registry.registryHash,
    interRequestDelayMs: delayMs,
    onProgress: progress => {
      const suffix = progress.status === "ok"
        ? `matched=${progress.matched}`
        : `failed=${progress.failureCode ?? "unknown"}`;
      console.log(`${progress.date}: ${suffix}`);
    },
  });

  if (inventory.failedDates.length > 0) {
    console.error("EDINET configured pilot scan is incomplete; no inventory file was written.");
    for (const failure of inventory.failedDates) console.error(`${failure.date}: ${failure.code}`);
    process.exitCode = 2;
    return;
  }

  const outputPath = resolveOutputPath(argValue("output"), boundary.issuerKey, from, to, startedAt);
  if (existsSync(outputPath)) throw new Error(`inventory already exists; refusing to overwrite: ${outputPath}`);
  writeExclusiveDurable(outputPath, inventory);

  console.log("");
  console.log(`inventory: ${outputPath}`);
  console.log(`documents: ${inventory.candidates.length}`);
  console.log(`lineage issues: ${inventory.lineage.issues.length}`);
  console.log(`blocking lineage issues: ${inventory.lineage.hasBlockingIssues}`);
  console.log(`inventoryHash: ${inventory.inventoryHash}`);
  console.log(`factPromotionPolicy: ${inventory.factPromotionPolicy}`);
  console.log(`requireOfficialPdfVisualReview: ${inventory.requireOfficialPdfVisualReview}`);
  console.log("document downloads: 0");
  console.log("appendAuthorized: false");
}

main().catch(error => {
  if (error instanceof EdinetCredentialsMissingError) {
    console.error(`EDINET: credentials_missing (${EDINET_API_KEY_ENV})`);
    console.error("Set the key only in the local .env file. Do not paste the value into chat or GitHub.");
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.message : "unknown configured EDINET pilot error";
  console.error(`Configured EDINET pilot failed: ${message}`);
  process.exitCode = 1;
});
