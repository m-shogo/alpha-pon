import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "data/edinet");
mkdirSync(root, { recursive: true });
const token = `${process.pid}-${Date.now()}`;
const validName = `test-reviewed-${token}.json`;
const validPath = resolve(root, validName);
const validOutput = resolve(root, `test-reviewed-${token}.foundation-preview.json`);
const invalidPath = resolve(root, `test-reviewed-invalid-${token}.json`);
const invalidOutput = resolve(root, `test-reviewed-invalid-${token}.foundation-preview.json`);
const symlinkPath = resolve(root, `test-reviewed-link-${token}.json`);

function validManifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    reviewId: `review:edinet:test:${token}`,
    reviewedBy: "human:test-reviewer",
    reviewedByHuman: true,
    reviewedAt: "2026-08-06T14:00:00+09:00",
    semanticMappingStatus: "confirmed",
    docID: "S100TEST",
    chainRootDocID: "S100TEST",
    documentTypeCode: "1",
    entityIds: ["entity:issuer:test", "entity:security:0000"],
    sourceContentHash: "a".repeat(64),
    title: "Reviewed EDINET test document",
    summary: "Human-reviewed local CLI fixture.",
    publishedAt: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
    eventAtStatus: "not_applicable",
    retrievalRunId: `run:edinet:test:${token}`,
    parserVersion: "edinet-parser-v1",
    normalizationVersion: "normalization-v1",
    normalizedStructureHash: "b".repeat(64),
    language: "ja",
    revisionKind: "initial",
    revisionSequence: 0,
    evidenceStatus: "active",
    documentRevisionStatus: "active",
    license: "local_only",
    storagePolicy: "local_only_content",
    sections: [{
      sectionId: "document-root",
      path: "/",
      ordinal: 0,
      titleHash: "c".repeat(64),
      contentHash: "d".repeat(64),
    }],
  };
}

function run(input: string, output?: string) {
  const args = [
    "--import",
    "tsx/esm",
    "src/research/cli/preview-reviewed-edinet.ts",
    "--input",
    input,
  ];
  if (output) args.push("--output", output);
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: { ...process.env },
  });
}

try {
  writeFileSync(validPath, `${JSON.stringify(validManifest(), null, 2)}\n`, "utf-8");
  const success = run(`data/edinet/${validName}`);
  assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
  assert.equal(existsSync(validOutput), true);
  const preview = JSON.parse(readFileSync(validOutput, "utf-8")) as {
    appendAuthorized?: unknown;
    evidence?: { sourceLocator?: string; contentHash?: string };
    documentRevision?: { contentHash?: string };
  };
  assert.equal(preview.appendAuthorized, false);
  assert.equal(preview.evidence?.sourceLocator, "edinet:document:s100test:type:1");
  assert.match(preview.evidence?.contentHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(preview.documentRevision?.contentHash ?? "", /^[a-f0-9]{64}$/);

  const overwrite = run(`data/edinet/${validName}`);
  assert.equal(overwrite.status, 1);
  assert.match(overwrite.stderr, /refusing to overwrite/);

  writeFileSync(
    invalidPath,
    `${JSON.stringify({ ...validManifest(), EDINET_API_KEY: "must-never-be-accepted" }, null, 2)}\n`,
    "utf-8",
  );
  const invalid = run(
    `data/edinet/${invalidPath.split("/").at(-1)}`,
    `data/edinet/${invalidOutput.split("/").at(-1)}`,
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /schema validation failed/);
  assert.equal(invalid.stderr.includes("must-never-be-accepted"), false);
  assert.equal(existsSync(invalidOutput), false);

  symlinkSync(validPath, symlinkPath);
  const symlink = run(`data/edinet/${symlinkPath.split("/").at(-1)}`);
  assert.equal(symlink.status, 1);
  assert.match(symlink.stderr, /symlinks are not allowed/);

  const outside = run("../outside-reviewed-edinet.json");
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /direct child of data\/edinet/);

  console.log("edinet-local-review-preview-cli.test.ts passed");
} finally {
  for (const path of [validPath, validOutput, invalidPath, invalidOutput, symlinkPath]) {
    if (existsSync(path)) rmSync(path, { force: true });
  }
}
