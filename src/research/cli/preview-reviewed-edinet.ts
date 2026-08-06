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
import { basename, dirname, extname, resolve } from "node:path";
import {
  buildReviewedEdinetFoundationPreview,
  type ReviewedEdinetFoundationInput,
} from "../edinet-reviewed-foundation-preview.js";
import { formatErrors, validate } from "../schema.js";
import { loadCouncilSchema } from "../stock-pro-council-v2-validation.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`missing required argument --${name}`);
  return value;
}

function localRoot(): string {
  const root = resolve(process.cwd(), "data/edinet");
  mkdirSync(root, { recursive: true });
  return root;
}

function resolveDirectLocalJson(pathInput: string, field: string): string {
  const root = localRoot();
  const target = resolve(process.cwd(), pathInput);
  if (dirname(target) !== root) {
    throw new Error(`${field} must be a direct child of data/edinet`);
  }
  if (extname(target).toLowerCase() !== ".json") {
    throw new Error(`${field} must be a JSON file`);
  }
  return target;
}

function defaultOutputPath(inputPath: string): string {
  const file = basename(inputPath, ".json");
  return resolve(localRoot(), `${file}.foundation-preview.json`);
}

function parseStrictJson(path: string): unknown {
  if (!existsSync(path)) throw new Error(`input file not found: ${path}`);
  if (lstatSync(path).isSymbolicLink()) {
    throw new Error("input symlinks are not allowed for local EDINET review manifests");
  }
  const content = readFileSync(path, "utf-8");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`invalid JSON: ${path}`);
  }
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

function main(): void {
  const inputPath = resolveDirectLocalJson(requiredArg("input"), "input");
  const outputArg = argValue("output");
  const outputPath = outputArg
    ? resolveDirectLocalJson(outputArg, "output")
    : defaultOutputPath(inputPath);

  if (inputPath === outputPath) throw new Error("input and output must differ");
  if (existsSync(outputPath)) {
    throw new Error(`preview already exists; refusing to overwrite: ${outputPath}`);
  }

  const input = parseStrictJson(inputPath);
  const schema = loadCouncilSchema(
    "research/schemas/edinet-reviewed-foundation-input.schema.json",
  );
  const schemaErrors = validate(input, schema);
  if (schemaErrors.length > 0) {
    throw new Error(`review manifest schema validation failed:\n${formatErrors(schemaErrors)}`);
  }

  const preview = buildReviewedEdinetFoundationPreview(
    input as ReviewedEdinetFoundationInput,
  );
  writeExclusiveDurable(outputPath, preview);

  console.log("EDINET reviewed Foundation preview created");
  console.log(`input: ${inputPath}`);
  console.log(`output: ${outputPath}`);
  console.log(`reviewId: ${preview.reviewId}`);
  console.log(`evidenceHash: ${preview.evidence.contentHash}`);
  console.log(`relationHash: ${preview.relation?.contentHash ?? "none"}`);
  console.log(`documentRevisionHash: ${preview.documentRevision.contentHash}`);
  console.log("appendAuthorized: false");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown preview error";
  console.error(`EDINET reviewed preview failed: ${message}`);
  process.exitCode = 1;
}
