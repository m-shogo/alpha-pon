// J-Quants 接続診断のテスト。
//
// 守りたい性質:
//   1. 未設定を「キーが無効」と言わない
//   2. 到達しているのに拒否された場合をネットワーク問題と混同しない
//   3. 一部だけ拒否ならプラン範囲外の可能性として区別する
//   4. 人間の作業が必要かを明示する

import assert from "node:assert/strict";
import {
  diagnoseJQuants,
  formatJQuantsDiagnosis,
  type JQuantsProbe,
} from "../src/execution/jquants-diagnosis.js";

function probe(over: Partial<JQuantsProbe> = {}): JQuantsProbe {
  return { path: "/v2/equities/bars/daily", status: 200, elapsedMs: 90, ...over };
}

function testNotConfiguredIsNotAnInvalidKey() {
  const result = diagnoseJQuants({ hasApiKey: false, hasEmailPassword: false, probes: [] });
  assert.equal(result.diagnosis, "not_configured");
  assert.ok(result.nextAction.includes(".env"));
  assert.equal(result.requiresHuman, true);
}

function testReachableWhenAnyProbeSucceeds() {
  const result = diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: false,
    probes: [probe({ status: 403, path: "/v2/listed/info" }), probe({ status: 200 })],
  });
  assert.equal(result.diagnosis, "reachable", "1つでも通れば認証は生きている");
  assert.equal(result.requiresHuman, false);
}

function testAllRejectedMeansCredentialProblem() {
  const result = diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: false,
    probes: [probe({ status: 403 }), probe({ status: 401, path: "/v1/listed/info" })],
  });
  assert.equal(result.diagnosis, "credential_rejected");
  assert.ok(result.nextAction.includes("再発行"));
}

function testPartialRejectionMeansPlanScope() {
  // 2026-09-11 の実測がこれ。listed/info は存在せず 403、bars/daily は 400。
  const result = diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: false,
    probes: [
      probe({ status: 403, path: "/v2/listed/info", message: "The requested endpoint does not exist" }),
      probe({ status: 400, path: "/v2/equities/bars/daily", message: "Your subscription covers ..." }),
    ],
  });
  assert.equal(result.diagnosis, "plan_not_entitled", "全滅でなければ資格情報の問題と断定しない");
}

function testFastRejectionIsNotNetworkProblem() {
  const result = diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: false,
    probes: [probe({ status: 403, elapsedMs: 89 }), probe({ status: 403, elapsedMs: 91 })],
  });
  assert.notEqual(result.diagnosis, "network_unreachable");
  assert.ok(
    result.details.some((one) => one.includes("ネットワークの問題ではありません")),
    "応答が速い＝到達していることを明示する",
  );
}

function testUnreachableWhenNoProbeArrives() {
  const result = diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: false,
    probes: [probe({ status: null, transportError: "dns", elapsedMs: 5 })],
  });
  assert.equal(result.diagnosis, "network_unreachable");
  assert.ok(result.nextAction.includes("認証情報の問題ではありません"));
}

function testRateLimitAndServerErrorAreDistinct() {
  assert.equal(
    diagnoseJQuants({ hasApiKey: true, hasEmailPassword: false, probes: [probe({ status: 429 })] }).diagnosis,
    "rate_limited",
  );
  assert.equal(
    diagnoseJQuants({ hasApiKey: true, hasEmailPassword: false, probes: [probe({ status: 503 })] }).diagnosis,
    "server_error",
  );
}

function testNoProbesWithCredentialsAsksToRun() {
  const result = diagnoseJQuants({ hasApiKey: true, hasEmailPassword: false, probes: [] });
  assert.equal(result.diagnosis, "network_unreachable");
  assert.ok(result.nextAction.includes("--execute"));
}

function testFormatDoesNotLeakSecrets() {
  const text = formatJQuantsDiagnosis(diagnoseJQuants({
    hasApiKey: true, hasEmailPassword: true, probes: [probe({ status: 200 })],
  }));
  assert.ok(text.includes("API キー あり"));
  assert.ok(!text.includes("JQUANTS_API_KEY="), "鍵の値を出さない");
  assert.ok(text.includes("次の作業"));
}

testNotConfiguredIsNotAnInvalidKey();
testReachableWhenAnyProbeSucceeds();
testAllRejectedMeansCredentialProblem();
testPartialRejectionMeansPlanScope();
testFastRejectionIsNotNetworkProblem();
testUnreachableWhenNoProbeArrives();
testRateLimitAndServerErrorAreDistinct();
testNoProbesWithCredentialsAsksToRun();
testFormatDoesNotLeakSecrets();

console.log("jquants-diagnosis: 全テスト成功");
