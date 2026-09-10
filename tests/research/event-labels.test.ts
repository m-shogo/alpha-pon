// イベント原因ラベル台帳のテスト。
//
// 守りたい性質:
//   1. 一次情報の URL 無しにラベルを付けられない（記憶や推測を許さない）
//   2. append-only。訂正は supersedes で新しい行として追記する
//   3. 未ラベルを treatment にも対照にもしない
//   4. 同じ候補に矛盾する有効ラベルが残らない

import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEventLabel,
  computeEventLabelId,
  readEventLabels,
  resolveEventLabels,
  splitCandidatesByLabel,
  TREATMENT_LABELS,
  type EventLabelInput,
} from "../../src/research/signals/event-labels.js";

const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-labels-"));
const NOW = new Date("2026-09-10T12:00:00+09:00");

function path(name: string): string {
  return join(dir, `${name}.jsonl`);
}

function label(over: Partial<EventLabelInput> = {}): EventLabelInput {
  return {
    candidateId: "am-8136-2026-01-07",
    code: "8136",
    date: "2026-01-07",
    label: "misconduct",
    evidenceUrls: ["https://www.release.tdnet.info/inbs/example.pdf"],
    labelledBy: "human",
    rationale: "第三者委員会設置の開示を確認",
    ...over,
  };
}

try {
  function testEvidenceUrlIsRequired() {
    for (const evidenceUrls of [[], undefined as unknown as string[]]) {
      assert.throws(
        () => appendEventLabel(label({ evidenceUrls }), path("evidence"), NOW),
        /evidenceUrls is required/,
        "記憶や推測でラベルを付けさせない",
      );
    }
    assert.throws(
      () => appendEventLabel(label({ evidenceUrls: ["http://example.com/x"] }), path("evidence"), NOW),
      /must use https/,
    );
    assert.throws(
      () => appendEventLabel(label({ evidenceUrls: ["not-a-url"] }), path("evidence"), NOW),
      /must be an absolute URL/,
    );
  }

  function testUnknownLabelStillNeedsEvidence() {
    // 「分からなかった」も、何を見て分からなかったかを残させる。
    const result = appendEventLabel(
      label({ label: "unknown", rationale: "TDnet/EDINET を確認したが該当開示なし" }),
      path("unknown-label"),
      NOW,
    );
    assert.equal(result.appended, true);
    assert.throws(
      () => appendEventLabel(
        label({ label: "unknown", evidenceUrls: [] }),
        path("unknown-label"),
        NOW,
      ),
      /evidenceUrls is required/,
    );
  }

  function testAppendOnlyAndIdempotent() {
    const p = path("append-only");
    const first = appendEventLabel(label(), p, NOW);
    const before = readFileSync(p, "utf-8");
    const second = appendEventLabel(label(), p, NOW);
    assert.equal(first.labelId, second.labelId);
    assert.equal(second.appended, false, "同一内容の再登録は行を増やさない");

    appendEventLabel(label({ candidateId: "am-7974-2026-01-07", code: "7974" }), p, NOW);
    const after = readFileSync(p, "utf-8");
    assert.ok(after.startsWith(before), "既存行を書き換えず末尾に追記するだけ");
    assert.equal(readEventLabels(p).length, 2);
  }

  function testCorrectionRequiresSupersedes() {
    const p = path("correction");
    const first = appendEventLabel(label(), p, NOW);
    // 訂正: misconduct → earnings
    appendEventLabel(
      label({ label: "earnings", rationale: "決算短信の下方修正だった", supersedesLabelId: first.labelId }),
      p,
      NOW,
    );
    const resolved = resolveEventLabels(readEventLabels(p));
    assert.equal(resolved.byCandidateId.get("am-8136-2026-01-07")?.label, "earnings", "訂正後が有効");
    assert.ok(resolved.supersededLabelIds.has(first.labelId));
    assert.equal(readEventLabels(p).length, 2, "元の行は消さない");
  }

  function testConflictingActiveLabelsAreRejected() {
    const p = path("conflict");
    appendEventLabel(label(), p, NOW);
    appendEventLabel(label({ label: "earnings", rationale: "別判断" }), p, NOW);
    assert.throws(
      () => resolveEventLabels(readEventLabels(p)),
      /conflicting active labels/,
      "訂正なしに2つの判断を並存させない",
    );
  }

  function testSupersedingUnknownLabelIsRejected() {
    assert.throws(
      () => appendEventLabel(
        label({ supersedesLabelId: "0".repeat(32) }),
        path("bad-supersede"),
        NOW,
      ),
      /cannot supersede an unknown label/,
    );
  }

  function testSplitSeparatesTreatmentControlAndUnlabelled() {
    const p = path("split");
    appendEventLabel(label({ candidateId: "c-1", code: "1111", label: "misconduct" }), p, NOW);
    appendEventLabel(label({ candidateId: "c-2", code: "2222", label: "read_across" }), p, NOW);
    appendEventLabel(label({ candidateId: "c-3", code: "3333", label: "earnings" }), p, NOW);
    appendEventLabel(label({ candidateId: "c-4", code: "4444", label: "unknown" }), p, NOW);

    const split = splitCandidatesByLabel(
      ["c-1", "c-2", "c-3", "c-4", "c-5"],
      resolveEventLabels(readEventLabels(p)),
    );
    assert.deepEqual(split.treatmentCandidateIds, ["c-1", "c-2"]);
    assert.deepEqual(split.controlPoolCandidateIds, ["c-3", "c-4"]);
    assert.deepEqual(split.unlabelledCandidateIds, ["c-5"], "未ラベルはどちらにも入れない");
    assert.equal(split.countByLabel.misconduct, 1);
    assert.equal(split.countByLabel.unknown, 1);
  }

  function testTreatmentLabelsAreConfigurable() {
    const p = path("configurable");
    appendEventLabel(label({ candidateId: "c-1", code: "1111", label: "earnings" }), p, NOW);
    const resolved = resolveEventLabels(readEventLabels(p));
    assert.deepEqual(splitCandidatesByLabel(["c-1"], resolved).treatmentCandidateIds, []);
    assert.deepEqual(
      splitCandidatesByLabel(["c-1"], resolved, ["earnings"]).treatmentCandidateIds,
      ["c-1"],
    );
  }

  function testDefaultTreatmentLabelsMatchTheEdgeFamily() {
    // 不祥事 Edge と read-across Edge が研究対象。業績起因や地合いは対照側。
    assert.deepEqual(
      [...TREATMENT_LABELS].sort(),
      ["employee_misconduct", "misconduct", "read_across", "subsidiary_localized"],
    );
  }

  function testLabelIdIsDeterministic() {
    assert.equal(
      computeEventLabelId(label({ evidenceUrls: ["https://a.example/1", "https://b.example/2"] })),
      computeEventLabelId(label({ evidenceUrls: ["https://b.example/2", "https://a.example/1"] })),
      "URL の並び順で別 ID にしない",
    );
    assert.notEqual(
      computeEventLabelId(label()),
      computeEventLabelId(label({ label: "earnings" })),
    );
  }

  function testMalformedLedgerFailsClosed() {
    const p = path("malformed");
    appendEventLabel(label(), p, NOW);
    appendFileSync(p, '{"schemaVersion":2}\n');
    assert.throws(() => readEventLabels(p), /schemaVersion must be 1/);
  }

  function testInvalidInputFailsClosed() {
    for (const [over, pattern] of [
      [{ code: "81" }, /4-5 alphanumeric/],
      [{ date: "2026/01/07" }, /must be YYYY-MM-DD/],
      [{ label: "not-a-label" as never }, /unknown event cause label/],
      [{ labelledBy: "  " }, /labelledBy must be a non-empty string/],
      [{ rationale: "" }, /rationale must be a non-empty string/],
    ] as const) {
      assert.throws(
        () => appendEventLabel(label(over as Partial<EventLabelInput>), path("invalid"), NOW),
        pattern,
      );
    }
  }

  testEvidenceUrlIsRequired();
  testUnknownLabelStillNeedsEvidence();
  testAppendOnlyAndIdempotent();
  testCorrectionRequiresSupersedes();
  testConflictingActiveLabelsAreRejected();
  testSupersedingUnknownLabelIsRejected();
  testSplitSeparatesTreatmentControlAndUnlabelled();
  testTreatmentLabelsAreConfigurable();
  testDefaultTreatmentLabelsMatchTheEdgeFamily();
  testLabelIdIsDeterministic();
  testMalformedLedgerFailsClosed();
  testInvalidInputFailsClosed();

  console.log("research/event-labels: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
