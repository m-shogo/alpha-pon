import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-unmatched-inspection-hardlink-"));
const acquisitionDirectory = resolve(localRoot, `sanrio-acquisition.hardlink-${process.pid}`);

function run(fidelityPath: string) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/inspect-sanrio-edinet-unmatched-anchors.ts",
      "--fidelity",
      relative(root, fidelityPath),
    ],
    { cwd: root, encoding: "utf-8" },
  );
}

try {
  mkdirSync(acquisitionDirectory, { recursive: true });

  const externalFidelity = join(tempRoot, "revision-source-fidelity-v1.external.json");
  const linkedFidelity = resolve(acquisitionDirectory, "revision-source-fidelity-v1.hardlink.json");
  writeFileSync(externalFidelity, "{}\n", "utf-8");
  linkSync(externalFidelity, linkedFidelity);
  const fidelityBefore = readFileSync(externalFidelity, "utf-8");

  const fidelityResult = run(linkedFidelity);
  assert.equal(fidelityResult.status, 1, `expected hard-linked fidelity rejection, stdout=${fidelityResult.stdout}`);
  assert.match(fidelityResult.stderr, /fidelity report must be a single-link regular non-symlink file/);
  assert.equal(
    readFileSync(externalFidelity, "utf-8"),
    fidelityBefore,
    "external fidelity hard-link target must remain unchanged",
  );
  rmSync(linkedFidelity, { force: true });

  const externalPdf = join(tempRoot, "document.pdf");
  const linkedPdf = resolve(acquisitionDirectory, "document.pdf");
  const pdfBytes = Buffer.from("synthetic-pdf\n", "utf-8");
  writeFileSync(externalPdf, pdfBytes);
  linkSync(externalPdf, linkedPdf);
  const pdfBefore = readFileSync(externalPdf);

  const fidelityPath = resolve(acquisitionDirectory, "revision-source-fidelity-v1.pdf-hardlink.json");
  writeFileSync(
    fidelityPath,
    `${JSON.stringify({
      candidates: [
        {
          toDocID: "SYNTHETIC-DOC",
          pdfBinaryFile: "document.pdf",
          pdfSha256: createHash("sha256").update(pdfBytes).digest("hex"),
          anchorResults: [{ matched: false }],
        },
      ],
    })}\n`,
    "utf-8",
  );

  const pdfResult = run(fidelityPath);
  assert.equal(pdfResult.status, 1, `expected hard-linked PDF rejection, stdout=${pdfResult.stdout}`);
  assert.match(pdfResult.stderr, /PDF artifact must be a single-link regular non-symlink file/);
  assert.deepEqual(readFileSync(externalPdf), pdfBefore, "external PDF hard-link target must remain unchanged");

  console.log("edinet-sanrio-real-pilot-unmatched-inspection-hardlink: hard-linked fidelity and PDF inputs are rejected OK");
} finally {
  rmSync(acquisitionDirectory, { recursive: true, force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
