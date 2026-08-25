import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./world-impact-report-input-date.test.js";
import "./world-impact-audit-input.test.js";
import { readReadOnlyJsonArrayFile } from "../src/read-only-json-file.js";
import {
  DEFAULT_REGIME_SCENARIO_REFLECTION_PATH,
  loadRegimeScenarioReflectionState,
  loadRegimeScenarioReflections,
} from "../src/regime-scenario-input.js";
import { parseWorldImpactLatestSnapshot } from "../src/world-impact-latest-input.js";

assert.equal(
  DEFAULT_REGIME_SCENARIO_REFLECTION_PATH,
  "data/world_event_reflections_latest.json",
  "regime scenario must consume the canonical latest reflection snapshot produced by world-event reflection",
);

assert.deepEqual(parseWorldImpactLatestSnapshot("[]"), [], "empty canonical latest snapshot remains valid");
assert.equal(
  parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803"}]')[0]?.reviewKey,
  "event__5803",
  "legacy rows with only stable review identity remain mergeable",
);
assert.equal(
  parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-06-10","updatedAt":"2026-06-12","outcomes":[{"horizon":"1d","priceStartDate":"2026-06-10","priceEndDate":"2026-06-11","evaluationAsOf":"2026-06-12","evaluatedAt":"2026-06-12"},{"horizon":"1w"}]}]')[0]?.reviewKey,
  "event__5803",
  "valid optional evaluation provenance with unique horizons remains mergeable",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot("{"),
  /not valid JSON/,
  "parse failure must block a write instead of replacing latest with only updated rows",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('{"reviews":[]}'),
  /root must be an array/,
  "invalid root must block a write instead of silently becoming an empty snapshot",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[null]'),
  /row 1 must be an object/,
  "malformed rows must not be dereferenced during latest merge",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{}]'),
  /row 1 requires reviewKey/,
  "rows without stable identity must not participate in latest merge",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":" event__5803"}]'),
  /reviewKey must not contain surrounding whitespace/,
  "stable review identities must remain canonical instead of creating whitespace variants",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803"},{"reviewKey":"event__5803"}]'),
  /duplicate reviewKey: event__5803/,
  "duplicate stable identities must not survive canonical latest preflight",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"horizon":"1d"},{"horizon":"1d"}]}]'),
  /duplicate outcome horizon: 1d/,
  "duplicate outcome horizons must not inflate canonical review/evaluation state",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"horizon":"2w"}]}]'),
  /horizon must be one of 1d, 1w, 1m/,
  "unsupported outcome horizons must not survive canonical latest preflight",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"horizon":" 1d "}]}]'),
  /horizon must be one of 1d, 1w, 1m/,
  "padded outcome horizons must not create alternate evidence identities",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-02-31"}]'),
  /createdAt must be a real YYYY-MM-DD date/,
  "invalid optional provenance dates must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-06-12","updatedAt":"2026-06-11"}]'),
  /updatedAt must not precede createdAt/,
  "reversed review lifecycle must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":{}}]'),
  /outcomes must be an array when present/,
  "malformed outcomes containers must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"priceStartDate":"2026-06-12","priceEndDate":"2026-06-11"}]}]'),
  /priceStartDate must not follow priceEndDate/,
  "reversed evaluation chronology must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"priceEndDate":"2026-06-13","evaluationAsOf":"2026-06-12"}]}]'),
  /priceEndDate must not follow evaluationAsOf/,
  "future price endpoint relative to cutoff must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"evaluationAsOf":"2026-06-13","evaluatedAt":"2026-06-12"}]}]'),
  /evaluationAsOf must not follow evaluatedAt/,
  "future evaluation cutoff relative to evaluation date must block canonical latest writes",
);

{
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-readonly-array-"));
  try {
    const validPath = join(dir, "valid.json");
    const invalidRootPath = join(dir, "invalid-root.json");
    const parseErrorPath = join(dir, "parse-error.json");
    writeFileSync(validPath, '[{"reviewKey":"event__5803"}]', "utf-8");
    writeFileSync(invalidRootPath, "null", "utf-8");
    writeFileSync(parseErrorPath, "{", "utf-8");

    const valid = readReadOnlyJsonArrayFile<{ reviewKey: string }>(validPath);
    assert.equal(valid.rows[0]?.reviewKey, "event__5803", "valid read-only array file remains usable");
    assert.equal(valid.parseError, false);
    assert.equal(valid.invalidRoot, false);

    const invalidRoot = readReadOnlyJsonArrayFile(invalidRootPath);
    assert.deepEqual(invalidRoot.rows, []);
    assert.equal(invalidRoot.invalidRoot, true, "literal null must not be silently treated as a valid empty array file");

    const parseError = readReadOnlyJsonArrayFile(parseErrorPath);
    assert.deepEqual(parseError.rows, []);
    assert.equal(parseError.parseError, true, "malformed JSON must remain distinguishable from a legitimate empty array");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-input-"));
  try {
    const validPath = join(dir, "valid.json");
    const invalidRootPath = join(dir, "invalid-root.json");
    const parseErrorPath = join(dir, "parse-error.json");
    const mixedRowsPath = join(dir, "mixed-rows.json");
    const missingPath = join(dir, "missing.json");
    writeFileSync(validPath, '[{"title":"地震対応","tags":["災害"]}]', "utf-8");
    writeFileSync(invalidRootPath, "{}", "utf-8");
    writeFileSync(parseErrorPath, "{", "utf-8");
    writeFileSync(mixedRowsPath, '[{"title":"地震対応","tags":["災害"]},{"title":"broken","tags":{}},{"category":"金融不安","tags":["銀行"]}]', "utf-8");

    assert.equal(loadRegimeScenarioReflections(validPath)[0]?.title, "地震対応", "valid reflection snapshot remains usable");
    assert.deepEqual(loadRegimeScenarioReflections(missingPath), [], "missing optional reflection history remains a legitimate empty input");
    assert.throws(() => loadRegimeScenarioReflections(invalidRootPath), /invalid_root/, "object root must not silently become a zero-signal regime report");
    assert.throws(() => loadRegimeScenarioReflections(parseErrorPath), /parse_error/, "malformed JSON must not silently become a zero-signal regime report");

    const mixed = loadRegimeScenarioReflectionState(mixedRowsPath);
    assert.deepEqual(
      mixed.rows.map(row => row.title ?? row.category),
      ["地震対応", "金融不安"],
      "one malformed reflection row must not stop valid regime-scenario evidence",
    );
    assert.equal(mixed.warnings.length, 1, "isolated malformed reflection rows must remain visible as metadata warnings");
    assert.match(mixed.warnings[0], /1 malformed reflection row\(s\).*row\(s\) 2/);
    assert.ok(!mixed.warnings[0].includes("broken"), "metadata warning must not expose raw malformed row content");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("world-impact latest input: invalid canonical snapshots, canonical/duplicate identities, horizon contract, duplicate horizons, optional provenance, and read-only file failures fail closed before write");
