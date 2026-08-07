import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  appendPriceRecords,
  type PitPriceRecord,
} from "./price-store.js";
import type { JsonSchema } from "./schema.js";

function assertInsideRoot(path: string, root: string): void {
  const rootResolved = resolve(root);
  const pathResolved = resolve(path);
  const rel = relative(rootResolved, pathResolved);
  if (rel === "" || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || resolve(rootResolved, rel) !== pathResolved) {
    throw new Error("private price path must be a file below the configured root");
  }
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function ensurePrivateDirectory(path: string, root: string): void {
  assertInsideRoot(path, root);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("private price directory must be a regular non-symlink directory");
  }
  const rootReal = realpathSync(resolve(root));
  const pathReal = realpathSync(path);
  const rel = relative(rootReal, pathReal);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("private price directory escaped configured root");
  }
  chmodSync(path, 0o700);
}

/**
 * Append local-only price records while enforcing filesystem privacy at the
 * storage boundary instead of relying solely on the caller's umask.
 */
export function appendPrivatePriceRecords(input: {
  root: string;
  path: string;
  records: PitPriceRecord[];
  schema: JsonSchema;
  now?: Date;
}): void {
  if (input.records.length === 0) return;
  const root = resolve(input.root);
  const path = resolve(input.path);
  assertInsideRoot(path, root);

  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("private price root must be a regular non-symlink directory");
  }
  chmodSync(root, 0o700);

  const directory = dirname(path);
  ensurePrivateDirectory(directory, root);

  if (existsSync(path)) {
    assertRegularNonSymlink(path, "private price file");
    chmodSync(path, 0o600);
  } else {
    const fd = openSync(path, "ax", 0o600);
    closeSync(fd);
  }

  appendPriceRecords(path, input.records, input.schema, input.now ?? new Date());
  assertRegularNonSymlink(path, "private price file");
  chmodSync(path, 0o600);
}
