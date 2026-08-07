import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  appendPriceRecords,
  type PitPriceRecord,
} from "./price-store.js";
import type { JsonSchema } from "./schema.js";

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function assertRegularNonSymlinkDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

/**
 * Append local-only price records while enforcing filesystem privacy at the
 * storage boundary instead of relying solely on the caller's umask.
 *
 * The target must be a direct child of a dedicated provider root. Supporting
 * arbitrary nested paths would make symlink traversal harder to reason about.
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
  if (dirname(path) !== root) {
    throw new Error("private price path must be a direct child of the configured root");
  }

  const parent = dirname(root);
  if (!existsSync(parent)) {
    throw new Error("private price root parent must already exist");
  }
  assertRegularNonSymlinkDirectory(parent, "private price root parent");

  if (existsSync(root)) {
    assertRegularNonSymlinkDirectory(root, "private price root");
  } else {
    mkdirSync(root, { mode: 0o700 });
    assertRegularNonSymlinkDirectory(root, "private price root");
  }
  chmodSync(root, 0o700);

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
