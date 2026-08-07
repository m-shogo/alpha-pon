import assert from "node:assert/strict";
import {
  canonicalSanrioLegacyHumanReviewFilenameKind,
  isSanrioLegacyHumanReviewFilename,
} from "../src/research/edinet-sanrio-parity-local-paths.js";

{
  const canonical = "revision-human-review-decision-v1.20260807T070000Z.json";
  assert.equal(isSanrioLegacyHumanReviewFilename(canonical), true);
  assert.equal(canonicalSanrioLegacyHumanReviewFilenameKind(canonical), "decision");
  console.log("edinet-sanrio-parity-local-paths: canonical decision filename accepted OK");
}

{
  const legacy = "revision-human-review-record-v1.20260806T120000Z.json";
  assert.equal(isSanrioLegacyHumanReviewFilename(legacy), true);
  assert.equal(canonicalSanrioLegacyHumanReviewFilenameKind(legacy), "legacy_record");
  console.log("edinet-sanrio-parity-local-paths: legacy record filename retained for compatibility OK");
}

for (const invalid of [
  "revision-human-review-input-v1.20260807T070000Z.json",
  "revision-human-review-decision-v2.20260807T070000Z.json",
  "../revision-human-review-decision-v1.20260807T070000Z.json",
  "revision-human-review-decision-v1.20260807T070000Z.md",
]) {
  assert.equal(isSanrioLegacyHumanReviewFilename(invalid), false, invalid);
  assert.equal(canonicalSanrioLegacyHumanReviewFilenameKind(invalid), null, invalid);
}
console.log("edinet-sanrio-parity-local-paths: unsafe/wrong-stage filenames rejected OK");
console.log("edinet-sanrio-parity-local-paths.test.ts passed");
