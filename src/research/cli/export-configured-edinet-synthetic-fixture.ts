import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetSyntheticFixture,
  renderConfiguredEdinetSyntheticFixtureManifest,
} from "../edinet-configured-synthetic-fixture.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function tmpRoot(): string {
  const root = resolve(process.cwd(), "tmp");
  if (!existsSync(root)) mkdirSync(root, { mode: 0o700 });
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("tmp must be a regular non-symlink directory");
  }
  return root;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function outputDirectory(): string {
  const root = tmpRoot();
  const input = argValue("output-dir")?.trim();
  const path = input
    ? resolve(process.cwd(), input)
    : resolve(root, `configured-edinet-synthetic-fixture-v1.${stamp(new Date())}`);
  if (
    dirname(path) !== root
    || !/^configured-edinet-synthetic-fixture-v1\.[A-Za-z0-9_-]+$/.test(basename(path))
  ) {
    throw new Error("output-dir must be a direct tmp/configured-edinet-synthetic-fixture-v1.* directory");
  }
  if (existsSync(path)) throw new Error(`output directory already exists: ${path}`);
  mkdirSync(path, { mode: 0o700 });
  return path;
}

function safeChild(directory: string, name: string, field: string): string {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped output directory`);
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

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function writeTree(output: string): void {
  const bundle = buildConfiguredEdinetSyntheticFixture();
  const data = resolve(output, "data");
  const edinet = resolve(data, "edinet");
  const acquisition = resolve(edinet, "synthetic-co-acquisition.fixture");
  mkdirSync(data, { mode: 0o700 });
  mkdirSync(edinet, { mode: 0o700 });
  mkdirSync(acquisition, { mode: 0o700 });

  for (const item of bundle.files) {
    if (sha256(item.content) !== item.sha256 || Buffer.byteLength(item.content, "utf-8") !== item.byteLength) {
      throw new Error(`synthetic file descriptor integrity mismatch: ${item.scope}/${item.fileName}`);
    }
    const directory = item.scope === "acquisition"
      ? acquisition
      : item.scope === "root"
        ? edinet
        : output;
    writeExclusive(safeChild(directory, item.fileName, "fixture file"), item.content);
  }

  writeExclusive(
    safeChild(output, "fixture-bundle.json", "fixture bundle"),
    `${JSON.stringify(bundle, null, 2)}\n`,
  );
  writeExclusive(
    safeChild(output, "fixture-manifest.md", "fixture manifest"),
    renderConfiguredEdinetSyntheticFixtureManifest(bundle),
  );

  console.log("Configured EDINET synthetic pipeline fixture");
  console.log(`output: ${output}`);
  console.log(`issuer: ${bundle.inventory.issuer.issuerKey} (${bundle.inventory.issuer.edinetCode}/${bundle.inventory.issuer.secCode})`);
  console.log(`files: ${bundle.files.length + 2}`);
  console.log(`dashboard status: ${bundle.dashboard.dashboardStatus}`);
  console.log(`bundleHash: ${bundle.bundleHash}`);
  console.log("synthetic: true");
  console.log("networkUsed: false");
  console.log("credentialsRequired: false");
  console.log("realIssuerAuthorized: false");
  console.log("realFilingContentIncluded: false");
  console.log("appendAuthorized: false");
}

try {
  writeTree(outputDirectory());
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown synthetic fixture export error";
  console.error(`Configured EDINET synthetic fixture export failed: ${message}`);
  process.exitCode = 1;
}
