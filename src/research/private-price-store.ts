import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  type Stats,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  appendPriceRecords,
  type PitPriceRecord,
} from "./price-store.js";
import type { JsonSchema } from "./schema.js";

function lstatIfPresent(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assertRegularPrivateFileStat(stat: Stats, field: string): void {
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
  if (stat.nlink !== 1) {
    throw new Error(`${field} must not be hard-linked`);
  }
}

function assertRegularNonSymlinkDirectoryStat(stat: Stats, field: string): void {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

/**
 * Append local-only price records while enforcing filesystem privacy at the
 * storage boundary instead of relying solely on the caller's umask.
 *
 * The target must be a direct child of a dedicated provider root. Supporting
 * arbitrary nested paths would make path aliasing harder to reason about.
 * Existing files must have exactly one hard link so a provider-local pathname
 * cannot silently alias an inode reachable from another pathname.
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
  const parentStat = lstatIfPresent(parent);
  if (!parentStat) throw new Error("private price root parent must already exist");
  assertRegularNonSymlinkDirectoryStat(parentStat, "private price root parent");

  const rootStat = lstatIfPresent(root);
  if (rootStat) {
    assertRegularNonSymlinkDirectoryStat(rootStat, "private price root");
  } else {
    mkdirSync(root, { mode: 0o700 });
    const createdRootStat = lstatIfPresent(root);
    if (!createdRootStat) throw new Error("private price root creation failed");
    assertRegularNonSymlinkDirectoryStat(createdRootStat, "private price root");
  }
  chmodSync(root, 0o700);

  const fileStat = lstatIfPresent(path);
  if (fileStat) {
    assertRegularPrivateFileStat(fileStat, "private price file");
    chmodSync(path, 0o600);
  } else {
    const fd = openSync(path, "ax", 0o600);
    closeSync(fd);
    const createdFileStat = lstatIfPresent(path);
    if (!createdFileStat) throw new Error("private price file creation failed");
    assertRegularPrivateFileStat(createdFileStat, "private price file");
  }

  appendPriceRecords(path, input.records, input.schema, input.now ?? new Date());
  const finalStat = lstatIfPresent(path);
  if (!finalStat) throw new Error("private price file disappeared after append");
  assertRegularPrivateFileStat(finalStat, "private price file");
  chmodSync(path, 0o600);
}
