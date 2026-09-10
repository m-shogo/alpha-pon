// 銘柄関係グラフのテスト。
//
// 守りたい性質:
//   1. code を持たない自由記述は辺にせず、件数で見えるようにする
//   2. 逆向きの辺を張って、config 未掲載の銘柄も起点にできる
//   3. 親子は subsidiary ↔ parent に反転する。大株主は反転しない
//   4. 自己参照・重複を作らない

import assert from "node:assert/strict";
import { buildCompanyRelationGraph } from "../../src/research/signals/company-relations.js";

function testCodelessRelationsAreCountedNotDropped() {
  const result = buildCompanyRelationGraph({
    companies: {
      "8136": {
        peers: [{ code: "7974", name: "任天堂", relation: "日本発IP" }],
        suppliersOrPartners: ["ライセンシー各社", "物流パートナー"],
        majorShareholders: ["有価証券報告書で確認"],
      },
    },
  });
  assert.equal(result.declaredRelationCount, 1);
  assert.equal(result.skippedWithoutCode.supplier_or_partner, 2, "自由記述は silent drop しない");
  assert.equal(result.skippedWithoutCode.major_shareholder, 1);
  assert.equal(result.skippedWithoutCode.peer, 0);
}

function testInverseEdgesLetUnlistedCompaniesBeSources() {
  const result = buildCompanyRelationGraph({
    companies: { "8136": { peers: [{ code: "7974", name: "任天堂" }] } },
  });
  assert.ok(result.graph.has("7974"), "config のキーに無い銘柄も起点になる");
  const inverse = result.graph.get("7974")!;
  assert.equal(inverse.length, 1);
  assert.equal(inverse[0].code, "8136");
  assert.equal(inverse[0].relationType, "peer");
  assert.equal(inverse[0].derived, true, "補完した辺であることを残す");
  assert.equal(result.derivedRelationCount, 1);
}

function testParentSubsidiaryInverts() {
  const result = buildCompanyRelationGraph({
    companies: { "285A": { parents: [{ code: "6501", name: "親会社" }] } },
  });
  assert.equal(result.graph.get("285A")![0].relationType, "parent");
  const inverse = result.graph.get("6501")!;
  assert.equal(inverse[0].relationType, "subsidiary", "親の逆は子");
  assert.equal(inverse[0].code, "285A");
}

function testMajorShareholderIsNotInverted() {
  const result = buildCompanyRelationGraph({
    companies: { "285A": { majorShareholders: [{ code: "8306", name: "大株主" }] } },
  });
  assert.equal(result.graph.get("285A")![0].relationType, "major_shareholder");
  assert.equal(result.graph.has("8306"), false, "「A の大株主が B」の逆は対称ではないので張らない");
}

function testInverseCanBeDisabled() {
  const result = buildCompanyRelationGraph(
    { companies: { "8136": { peers: [{ code: "7974" }] } } },
    { includeInverse: false },
  );
  assert.equal(result.graph.has("7974"), false);
  assert.equal(result.derivedRelationCount, 0);
}

function testSelfReferenceAndDuplicatesAreDropped() {
  const result = buildCompanyRelationGraph({
    companies: {
      "8136": {
        peers: [{ code: "8136" }, { code: "7974" }, { code: "7974" }],
      },
    },
  });
  const edges = result.graph.get("8136")!;
  assert.deepEqual(edges.map((one) => one.code), ["7974"], "自己参照と重複を作らない");
  assert.equal(result.declaredRelationCount, 1);
}

function testDeclaredEdgeIsNotOverwrittenByDerived() {
  // 双方向に peer 宣言がある場合、両方 derived: false のまま。
  const result = buildCompanyRelationGraph({
    companies: {
      "8136": { peers: [{ code: "7974", relation: "A視点" }] },
      "7974": { peers: [{ code: "8136", relation: "B視点" }] },
    },
  });
  assert.equal(result.graph.get("8136")![0].derived, false);
  assert.equal(result.graph.get("7974")![0].derived, false);
  assert.equal(result.graph.get("7974")![0].note, "B視点", "直接宣言のメモを補完で上書きしない");
  assert.equal(result.derivedRelationCount, 0);
}

function testMalformedConfigFailsClosed() {
  assert.throws(() => buildCompanyRelationGraph(null), /must have a companies object/);
  assert.throws(() => buildCompanyRelationGraph({}), /must have a companies object/);
  assert.throws(
    () => buildCompanyRelationGraph({ companies: { "81": { peers: [] } } }),
    /non-canonical code/,
  );
  assert.throws(
    () => buildCompanyRelationGraph({ companies: { "8136": { peers: "x" } } }),
    /must be an array/,
  );
  assert.throws(
    () => buildCompanyRelationGraph({ companies: { "8136": "x" } }),
    /must be an object/,
  );
}

function testOutputIsDeterministic() {
  const config = {
    companies: {
      "8136": { peers: [{ code: "7974" }, { code: "4661" }, { code: "7832" }] },
    },
  };
  const first = buildCompanyRelationGraph(config);
  const second = buildCompanyRelationGraph(config);
  assert.deepEqual(
    first.graph.get("8136")!.map((one) => one.code),
    ["4661", "7832", "7974"],
    "code 昇順",
  );
  assert.equal(
    JSON.stringify([...first.graph.entries()]),
    JSON.stringify([...second.graph.entries()]),
  );
}

testCodelessRelationsAreCountedNotDropped();
testInverseEdgesLetUnlistedCompaniesBeSources();
testParentSubsidiaryInverts();
testMajorShareholderIsNotInverted();
testInverseCanBeDisabled();
testSelfReferenceAndDuplicatesAreDropped();
testDeclaredEdgeIsNotOverwrittenByDerived();
testMalformedConfigFailsClosed();
testOutputIsDeterministic();

console.log("research/company-relations: 全テスト成功");
