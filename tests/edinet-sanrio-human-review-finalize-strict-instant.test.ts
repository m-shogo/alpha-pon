import assert from "node:assert/strict";
import { finalizeSanrioEdinetHumanReviewRecord } from "../src/research/edinet-sanrio-human-review-finalize.js";

const invalidInspection = {};

{
  assert.throws(
    () => finalizeSanrioEdinetHumanReviewRecord({
      inspectionReport: invalidInspection,
      sourceInspectionFile: "synthetic-inspection.json",
      editedRecord: { generatedAt: "2026-08-11T01:00:00" },
    }),
    /explicit timezone/,
  );
  console.log("edinet-sanrio-human-review-finalize: timezone-less generatedAt fails at provenance boundary OK");
}

{
  assert.throws(
    () => finalizeSanrioEdinetHumanReviewRecord({
      inspectionReport: invalidInspection,
      sourceInspectionFile: "synthetic-inspection.json",
      editedRecord: { generatedAt: "2026-02-29T01:00:00Z" },
    }),
    /valid Gregorian/,
  );
  console.log("edinet-sanrio-human-review-finalize: impossible Gregorian generatedAt fails at provenance boundary OK");
}

console.log("edinet-sanrio-human-review-finalize-strict-instant.test.ts passed");
