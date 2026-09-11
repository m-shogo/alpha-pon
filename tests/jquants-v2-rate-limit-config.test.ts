// 設定した間隔が、実際に待ち時間へ反映されるかの検査。
//
// なぜ要るか（2026-09-11 に踏んだ欠陥）:
//   適応レート制限の状態を **モジュール読み込み時** に既定値で作っていた。
//   そのため CLI が main() の中で JQUANTS_V2_REQUEST_INTERVAL_MS を
//   設定しても一切効かず、20秒のつもりで 3秒間隔のまま走っていた。
//   `applyMeasuredRateLimit()` という関数まで用意してあったのに、
//   効いていることを一度も確かめていなかった。
//
//   さらに「一括取得の開始時に状態を戻す」と書かれた
//   resetJQuantsV2RateLimit() を、どの取り込みも呼んでいなかった。
//
//   設定する場所と効く場所の順序に依存する作りは、動かなくても
//   エラーにならない。**必ず数字で確かめる。**

import assert from "node:assert/strict";
import {
  jquantsV2RateLimitSnapshot,
  resetJQuantsV2RateLimit,
} from "../src/fetcher/jquants.js";

const original = process.env.JQUANTS_V2_REQUEST_INTERVAL_MS;

function withInterval(value: string | undefined, run: () => void): void {
  if (value === undefined) delete process.env.JQUANTS_V2_REQUEST_INTERVAL_MS;
  else process.env.JQUANTS_V2_REQUEST_INTERVAL_MS = value;
  resetJQuantsV2RateLimit();
  try {
    run();
  } finally {
    resetJQuantsV2RateLimit();
  }
}

try {
  // 未設定なら既定の3秒。
  withInterval(undefined, () => {
    assert.equal(jquantsV2RateLimitSnapshot().currentIntervalMs, 3_000);
  });

  // 設定したら、その値で状態が作られる。
  // **import より後に設定しても効くこと**がこのテストの要点。
  withInterval("20000", () => {
    assert.equal(
      jquantsV2RateLimitSnapshot().currentIntervalMs,
      20_000,
      "main() の中で設定した間隔が反映されること",
    );
  });

  // 上限（60秒）を超える値は既定へ落とす。壊れた設定で無言で止まらない。
  withInterval("999999", () => {
    assert.equal(jquantsV2RateLimitSnapshot().currentIntervalMs, 3_000);
  });

  // 数値でない値も既定へ落とす。
  withInterval("twenty", () => {
    assert.equal(jquantsV2RateLimitSnapshot().currentIntervalMs, 3_000);
  });

  console.log("jquants-v2-rate-limit-config: 全テスト成功");
} finally {
  if (original === undefined) delete process.env.JQUANTS_V2_REQUEST_INTERVAL_MS;
  else process.env.JQUANTS_V2_REQUEST_INTERVAL_MS = original;
  resetJQuantsV2RateLimit();
}
