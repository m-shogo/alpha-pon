import "./catalog-validation.test.js";
import "./stock-pro-council-v2-validation.test.js";
import "./stock-pro-council-ledgers.test.js";
import "./stock-pro-council-ledger-hardening.test.js";
import "./stock-pro-council-replay.test.js";
import "./stock-pro-council-replay-repository.test.js";
import "./security-master.test.js";
import "./security-master-resolver-namespace.test.js";
import "./claim-contradiction-graph.test.js";
import "./claim-contradiction-graph-hardening.test.js";
import "./claim-contradiction-graph-repository.test.js";
import "./claim-contradiction-graph-pit.test.js";
import "./claim-contradiction-graph-writer.test.js";
import "./claim-contradiction-graph-snapshot.test.js";
import "./document-revision-diff.test.js";
import "./document-revision-diff-integrity.test.js";
import "./document-revision-diff-pit.test.js";
import "./document-revision-diff-repository.test.js";
import "./document-revision-diff-snapshot.test.js";
import "./document-revision-diff-writer.test.js";
import "./edinet-reviewed-foundation-preview.test.js";
import "./edinet-reviewed-foundation-preview-strict-instant.test.js";
import "./edinet-local-review-preview-cli.test.js";
import "./evidence-package-manifest.test.js";
import "./evidence-package-governed.test.js";
import "./evidence-package-ledger.test.js";
import "./evidence-package-repository.test.js";
import "./testable-hypothesis-scenario.test.js";
import "./testable-hypothesis-scenario-hardening.test.js";
import "./testable-hypothesis-scenario-ledger.test.js";
import "./testable-hypothesis-scenario-repository.test.js";
import "./testable-hypothesis-scenario-writer.test.js";
import "./foundation-decision-integration.test.js";
import "./corporate-action-clearance-strict-instant.test.js";
import "./iso-instant-precision.test.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import {
  formatErrors,
  isValidDate,
  isValidDateTime,
  stableStringify,
  validate,
} from "../../src/research/schema.js";

const edgeSchema = JSON.parse(readFileSync("research/schemas/edge.schema.json", "utf-8"));

function testDateFormats() {
  assert.equal(isValidDate("2026-08-04"), true);
  assert.equal(isValidDate("2026-02-31"), false, "存在しない日付は弾く");
  assert.equal(isValidDate("20260804"), false);

  assert.equal(isValidDateTime("2026-08-04T15:30:00+09:00"), true);
  assert.equal(isValidDateTime("2026-08-04T15:30+09:00"), false, "strict instantでは秒を必須にする");
  assert.equal(isValidDateTime("2024-02-29T15:30:00Z"), true, "実在する閏日は許可する");
  assert.equal(isValidDateTime("2026-08-04T15:30:00.123456789+09:00"), true);
  assert.equal(isValidDateTime("2026-08-04T15:30:00.1234567890+09:00"), false, "nanosecondを超えるfractional secondを拒否する");
  assert.equal(isValidDateTime("2026-08-04T15:30:00"), false, "タイムゾーン必須");
  assert.equal(isValidDateTime("2026-08-04"), false);

  assert.equal(isValidDateTime("2026-02-29T12:00:00Z"), false, "非閏年2/29を3/1へ繰り上げない");
  assert.equal(isValidDateTime("2026-02-31T12:00:00Z"), false, "存在しない月日を繰り上げない");
  assert.equal(isValidDateTime("2026-08-04T24:00:00Z"), false, "24:00を翌日へ繰り上げない");
  assert.equal(isValidDateTime("2026-08-04T15:60:00Z"), false, "不正minuteを拒否する");
  assert.equal(isValidDateTime("2026-08-04T15:30:60Z"), false, "leap secondは現在のcontractでは許可しない");
  assert.equal(isValidDateTime("2026-08-04T15:30:00+14:00"), true, "UTC offset上限は許可する");
  assert.equal(isValidDateTime("2026-08-04T15:30:00+14:01"), false, "UTC offset上限超過を拒否する");
  assert.equal(isValidDateTime("2026-08-04T15:30:00+15:00"), false, "非現実的offsetを拒否する");
  assert.equal(isValidDateTime("2026-08-04T15:30:00-00:00"), false, "unknown offsetを既知のUTC instantとして扱わない");
  console.log("research/schema: 日付フォーマット OK");
}

function testStableStringify() {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }), "キー順に依存しない");
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
  console.log("research/schema: stableStringify OK");
}

function testValidFixturePasses() {
  const edge = load(readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8"));
  const errors = validate(edge, edgeSchema);
  assert.deepEqual(errors, [], `valid fixture がエラーになった:\n${formatErrors(errors)}`);
  console.log("research/schema: valid フィクスチャ OK");
}

function testInvalidFixtureFails() {
  const edge = load(readFileSync("research/fixtures/invalid/edge-unevidenced-pass.yml", "utf-8"));
  const errors = validate(edge, edgeSchema);
  assert.ok(errors.some((error) => error.path === "mechanism"), "mechanism の長さ違反を検出する");
  console.log("research/schema: invalid フィクスチャ OK");
}

function testUnknownFieldRejected() {
  const edge = load(readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8")) as Record<string, unknown>;
  const errors = validate({ ...edge, whoopsTypo: 1 }, edgeSchema);
  assert.ok(errors.some((error) => error.path === "whoopsTypo"), "スキーマ外フィールドを弾く");
  console.log("research/schema: 未定義フィールド検出 OK");
}

function testSourceTypeRejectsSns() {
  const edge = load(readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8")) as Record<string, unknown>;
  const evidence = [{
    source: "https://example.invalid/post",
    sourceType: "sns",
    observedAt: "2024-01-04T15:30:00+09:00",
    summary: "SNS 由来の情報",
  }];
  const errors = validate({ ...edge, evidence }, edgeSchema);
  assert.ok(errors.some((error) => error.path === "evidence[0].sourceType"), "SNS は sourceType の enum に存在しないので弾かれる");
  console.log("research/schema: SNS 出典の拒否 OK");
}

function testUnsupportedKeywordThrows() {
  assert.throws(() => validate({}, { type: "object", allOf: [] }), /未対応の JSON Schema キーワード/, "未対応キーワードを黙って無視しない");
  console.log("research/schema: 未対応キーワードで例外 OK");
}

testDateFormats();
testStableStringify();
testValidFixturePasses();
testInvalidFixtureFails();
testUnknownFieldRejected();
testSourceTypeRejectsSns();
testUnsupportedKeywordThrows();

console.log("research/schema: 全テスト成功");