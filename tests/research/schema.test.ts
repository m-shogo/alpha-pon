import "./catalog-validation.test.js";
import "./stock-pro-council-v2-validation.test.js";
import "./stock-pro-council-ledgers.test.js";
import "./stock-pro-council-ledger-hardening.test.js";
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
  assert.equal(isValidDateTime("2026-08-04T15:30:00"), false, "タイムゾーン必須");
  assert.equal(isValidDateTime("2026-08-04"), false);
  console.log("research/schema: 日付フォーマット OK");
}

function testStableStringify() {
  assert.equal(
    stableStringify({ b: 1, a: 2 }),
    stableStringify({ a: 2, b: 1 }),
    "キー順に依存しない",
  );
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
  const edge = load(
    readFileSync("research/fixtures/invalid/edge-unevidenced-pass.yml", "utf-8"),
  );
  const errors = validate(edge, edgeSchema);
  assert.ok(
    errors.some((error) => error.path === "mechanism"),
    "mechanism の長さ違反を検出する",
  );
  console.log("research/schema: invalid フィクスチャ OK");
}

function testUnknownFieldRejected() {
  const edge = load(
    readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8"),
  ) as Record<string, unknown>;
  const errors = validate({ ...edge, whoopsTypo: 1 }, edgeSchema);
  assert.ok(
    errors.some((error) => error.path === "whoopsTypo"),
    "スキーマ外フィールドを弾く（タイポで静かに無視されるのを防ぐ）",
  );
  console.log("research/schema: 未定義フィールド検出 OK");
}

function testSourceTypeRejectsSns() {
  const edge = load(
    readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8"),
  ) as Record<string, unknown>;
  const evidence = [
    {
      source: "https://example.invalid/post",
      sourceType: "sns",
      observedAt: "2024-01-04T15:30:00+09:00",
      summary: "SNS 由来の情報",
    },
  ];
  const errors = validate({ ...edge, evidence }, edgeSchema);
  assert.ok(
    errors.some((error) => error.path === "evidence[0].sourceType"),
    "SNS は sourceType の enum に存在しないので弾かれる",
  );
  console.log("research/schema: SNS 出典の拒否 OK");
}

function testUnsupportedKeywordThrows() {
  assert.throws(
    () => validate({}, { type: "object", allOf: [] }),
    /未対応の JSON Schema キーワード/,
    "未対応キーワードを黙って無視しない",
  );
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
