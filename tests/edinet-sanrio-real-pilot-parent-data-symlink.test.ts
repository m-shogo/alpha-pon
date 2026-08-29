import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCanonicalEdinetRoot } from "../src/research/edinet-local-root-boundary.js";

const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-parent-data-symlink-"));
const outsideData = join(base, "outside-data");
mkdirSync(join(outsideData, "edinet"), { recursive: true });
symlinkSync(outsideData, join(base, "data"), "dir");

assert.throws(
  () => resolveCanonicalEdinetRoot(base),
  /data\/edinet parent data directory must not be a symlink/,
  "canonical Sanrio local root must fail closed when data is a symlink",
);

console.log("edinet-sanrio-real-pilot-parent-data-symlink: parent data symlink is rejected OK");
