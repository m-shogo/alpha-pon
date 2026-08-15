import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readReadOnlyJsonObjectArrayFile } from "../src/read-only-json-file.js";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

{
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-read-only-json-"));
  try {
    const valid = join(dir, "valid.json");
    writeFileSync(valid, JSON.stringify({ generatedAt: "2026-08-16", snapshots: [{ code: "8136" }] }), "utf-8");
    const validLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(valid, "snapshots");
    assert(validLoad.rows.length === 1, "valid object-array input はrowsを保持する必要があります");
    assert(!validLoad.parseError && !validLoad.invalidRoot && !validLoad.invalidField, "valid input をinvalid扱いしない");

    const malformed = join(dir, "malformed.json");
    writeFileSync(malformed, "{not-json", "utf-8");
    const malformedLoad = readReadOnlyJsonObjectArrayFile(malformed, "snapshots");
    assert(malformedLoad.parseError, "parse不能なread-only JSONを空データと同化しない");
    assert(!malformedLoad.missing, "存在する壊れたファイルをmissing扱いしない");

    const invalidRoot = join(dir, "invalid-root.json");
    writeFileSync(invalidRoot, JSON.stringify([]), "utf-8");
    const invalidRootLoad = readReadOnlyJsonObjectArrayFile(invalidRoot, "snapshots");
    assert(invalidRootLoad.invalidRoot, "array rootをobjectとして受理しない");

    const invalidField = join(dir, "invalid-field.json");
    writeFileSync(invalidField, JSON.stringify({ snapshots: {} }), "utf-8");
    const invalidFieldLoad = readReadOnlyJsonObjectArrayFile(invalidField, "snapshots");
    assert(invalidFieldLoad.invalidField, "object-shaped snapshotsを空配列と同化しない");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const data = readJson("reports/stock_pro_committee_latest.json");
  if (data !== null) {
    assert(isObject(data), "stock_pro_committee_latest.json は object である必要があります");
    assert(Array.isArray(data.decisions), "stock_pro_committee_latest.json.decisions は配列である必要があります");
    for (const decision of data.decisions) {
      assert(isObject(decision), "decision は object である必要があります");
      assert(typeof decision.code === "string", "decision.code は string である必要があります");
      assert(typeof decision.name === "string", "decision.name は string である必要があります");
      assert(typeof decision.finalLabel === "string", "decision.finalLabel は string である必要があります");
      assert(typeof decision.originalFinalLabel === "string", "decision.originalFinalLabel は string である必要があります");
      assert(typeof decision.finalScore === "number", "decision.finalScore は number である必要があります");
      assert(Array.isArray(decision.verdicts), "decision.verdicts は配列である必要があります");
      assert(Array.isArray(decision.legendVerdicts), "decision.legendVerdicts は配列である必要があります");
      assert(Array.isArray(decision.disagreements), "decision.disagreements は配列である必要があります");
      assert(Array.isArray(decision.nextActions), "decision.nextActions は配列である必要があります");
      assert(Array.isArray(decision.blockers), "decision.blockers は配列である必要があります");
      assert(Array.isArray(decision.missingEvidence), "decision.missingEvidence は配列である必要があります");
      assert("consensus" in decision && isObject(decision.consensus), "decision.consensus は object である必要があります");
    }
  }
}

{
  const data = readJson("apps/web/public/generated/alpha-pon-data.json");
  if (data !== null) {
    assert(isObject(data), "alpha-pon-data.json は object である必要があります");
    const committeeJson = readJson("reports/stock_pro_committee_latest.json");
    assert("legendProCommittee" in data, "alpha-pon-data.json は legendProCommittee を必ず持つ必要があります");
    assert("buffettQuality" in data, "alpha-pon-data.json は buffettQuality を必ず持つ必要があります");
    assert("valuationSnapshots" in data, "alpha-pon-data.json は valuationSnapshots を必ず持つ必要があります");
    assert("irEventEvidence" in data, "alpha-pon-data.json は irEventEvidence を必ず持つ必要があります");
    assert("stockProCommitteeJson" in data, "alpha-pon-data.json は stockProCommitteeJson を必ず持つ必要があります");
    assert("specialSituationOps" in data, "alpha-pon-data.json は specialSituationOps を必ず持つ必要があります");
    assert("hypothesisOutcomeIntegrity" in data, "alpha-pon-data.json は hypothesisOutcomeIntegrity を必ず持つ必要があります");
    assert(Array.isArray(data.universeCandidates), "alpha-pon-data.json.universeCandidates は配列である必要があります");
    if (isObject(data.universeScan)) {
      assert(data.universeScan.count === data.universeCandidates.length, "universeScan.count は universeCandidates 件数と一致する必要があります");
    }

    const committee = data.legendProCommittee;
    assert(isObject(committee), "legendProCommittee は object である必要があります");
    assert(Array.isArray(committee.decisions), "legendProCommittee.decisions は配列である必要があります");
    if (isObject(committeeJson) && Array.isArray(committeeJson.decisions)) {
      assert(
        committee.decisions.length === committeeJson.decisions.length,
        `legendProCommittee.decisions 件数が stock_pro_committee_latest.json と一致しません (${committee.decisions.length} !== ${committeeJson.decisions.length})`
      );
    }
    for (const decision of committee.decisions) {
      assert(isObject(decision), "legendProCommittee decision は object である必要があります");
      assert("originalFinalLabel" in decision, "legendProCommittee decision は originalFinalLabel を持つ必要があります");
      assert("finalLabel" in decision, "legendProCommittee decision は finalLabel を持つ必要があります");
      assert("finalScore" in decision, "legendProCommittee decision は finalScore を持つ必要があります");
      assert("consensus" in decision, "legendProCommittee decision は consensus を持つ必要があります");
      assert(Array.isArray(decision.disagreements), "legendProCommittee.disagreements は配列である必要があります");
      assert(Array.isArray(decision.nextActions), "legendProCommittee.nextActions は配列である必要があります");
      assert(Array.isArray(decision.blockers), "legendProCommittee.blockers は配列である必要があります");
      assert(Array.isArray(decision.missingEvidence), "legendProCommittee.missingEvidence は配列である必要があります");
      assert("legendVerdicts" in decision, "legendProCommittee decision は legendVerdicts を持つ必要があります");
    }
    assert("ipoThemeWatch" in data, "alpha-pon-data.json は ipoThemeWatch を必ず持つ必要があります");
    const watch = data.ipoThemeWatch;
    assert(isObject(watch), "ipoThemeWatch は object である必要があります");
    assert(Array.isArray(watch.rules), "ipoThemeWatch.rules は配列である必要があります");
    assert(watch.rules.length > 0, "ipoThemeWatch.rules は1件以上必要です");
    assert(Array.isArray(watch.phases), "ipoThemeWatch.phases は配列である必要があります");
    assert(watch.phases.length > 0, "ipoThemeWatch.phases は1件以上必要です");
    assert(Array.isArray(watch.outcomeStats), "ipoThemeWatch.outcomeStats は配列である必要があります");
    for (const rule of watch.rules) {
      assert(isObject(rule), "ipoThemeWatch rule は object である必要があります");
      assert(typeof rule.id === "string", "ipoThemeWatch.rules[].id は string である必要があります");
      assert(typeof rule.defaultAction === "string", "ipoThemeWatch.rules[].defaultAction は string である必要があります");
      assert(Array.isArray(rule.relatedCompanies), "ipoThemeWatch.rules[].relatedCompanies は配列である必要があります");
    }
  }
}

{
  const stockCandidates = readJson("apps/web/public/generated/stock-candidates.json");
  if (stockCandidates !== null) {
    assert(isObject(stockCandidates), "stock-candidates.json は object である必要があります");
    assert(Array.isArray(stockCandidates.candidates), "stock-candidates.json.candidates は配列である必要があります");
    assert(stockCandidates.count === stockCandidates.candidates.length, "stock-candidates.json.count は candidates 件数と一致する必要があります");
  }
}

console.log("pro generated data shape tests passed");
