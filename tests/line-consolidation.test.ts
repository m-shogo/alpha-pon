// LINE統合通知の中核ロジックのテスト。
// 実ネットワークには一切接続しない（DryRunTransport / 注入した fetch モックのみ）。
// pnpm test で自動実行される。

import assert from "node:assert/strict";
import {
  buildConsolidatedMessage,
  parseEntries,
  dedupeEntries,
  normalizeKey,
  detectSection,
  redactSecrets,
  createTransport,
  DryRunTransport,
  LineApiTransport,
  LINE_MAX_CHARS,
  SECTION_ORDER,
} from "../src/line-consolidation.js";

const TODAY = "2026-08-05";

function morningLite(body: string): string {
  return [
    "🌅 Alpha Pon Morning Lite 2026-08-05",
    "5分朝刊 / 重要な変化だけ",
    "━━━━━━━━━━━━",
    body,
    "※売買推奨ではありません。事実・報道・噂は混ぜず、未確認は一次情報不足として扱います。",
  ].join("\n");
}

function special(body: string): string {
  return ["💎 Alpha Pon 特殊状況 Lite 2026-08-05", "個人重点・特殊状況だけ優先確認", body].join("\n");
}

function aiNews(body: string): string {
  return ["🤖 AIニュース 2026-08-05", body].join("\n");
}

// --- detectSection / parse -------------------------------------------------

assert.equal(detectSection("🌅 Alpha Pon Morning Lite 2026-08-05\n..."), "📊 銘柄スコア");
assert.equal(detectSection("💎 Alpha Pon 特殊状況 Lite\n..."), "💎 特殊状況");
assert.equal(detectSection("🤖 AIニュース\n..."), "🤖 AI");
assert.equal(detectSection("何か不明なテキスト"), null);

// 空文字・空白のみ・ヘッダのみ（本文なし）は除外される
{
  const parsed = parseEntries(["", "   \n  ", morningLite(""), "🤖 AIニュース\n"]);
  assert.equal(parsed.length, 0, "空/本文なしの断片は全て除外される");
}

// --- 0件 -------------------------------------------------------------------
{
  const r = buildConsolidatedMessage([], { today: TODAY });
  assert.equal(r.message, null, "0件はメッセージ null（空通知を送らない）");
  assert.equal(r.sections.length, 0);
}

// 本文なし断片だけ → やはり null
{
  const r = buildConsolidatedMessage([morningLite("")], { today: TODAY });
  assert.equal(r.message, null);
}

// --- 通常1件 ---------------------------------------------------------------
{
  const r = buildConsolidatedMessage([morningLite("1. 📌 7203 トヨタ 62点")], { today: TODAY });
  assert.ok(r.message);
  assert.ok(r.message!.includes("🌅 Alpha Pon 朝刊 2026-08-05"));
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"));
  assert.ok(r.message!.includes("7203 トヨタ"));
  assert.ok(r.message!.includes("※売買推奨ではありません"));
  assert.equal(r.truncated, false);
  assert.equal(r.omittedSectionCount, 0);
}

// --- 通常多数（複数セクション、テーマは1つに畳む）--------------------------
{
  const r = buildConsolidatedMessage(
    [
      morningLite("1. 📌 7203 トヨタ 62点"),
      special("・ABC 特殊状況"),
      aiNews("・AIチップ需要"),
      "🔧 半導体ニュース\n・装置受注",
    ],
    { today: TODAY },
  );
  assert.ok(r.message);
  // 📊 が 💎 より前（決定順）
  const idxScore = r.message!.indexOf("■ 📊 銘柄スコア");
  const idxSpecial = r.message!.indexOf("■ 💎 特殊状況");
  const idxTheme = r.message!.indexOf("■ 📰 テーマニュース");
  assert.ok(idxScore >= 0 && idxSpecial > idxScore, "セクション順が決定論的");
  assert.ok(idxTheme > idxSpecial, "テーマニュースは末尾セクション");
  // AI と 半導体 が同一テーマセクションに畳まれている
  assert.ok(r.message!.includes("🤖 AI") && r.message!.includes("🔧 半導体"));
}

// --- 順序の決定性 / 入力順非依存 -------------------------------------------
{
  const inputs = [special("・S1"), aiNews("・A1"), morningLite("1. 📌 111 X 50点")];
  const forward = buildConsolidatedMessage(inputs, { today: TODAY }).message;
  const reversed = buildConsolidatedMessage([...inputs].reverse(), { today: TODAY }).message;
  assert.equal(forward, reversed, "入力順が違っても同一の統合結果になる");
}

// --- 重複排除: 同一論理項目が複数ソースから来ても1回だけ --------------------
{
  // pipeline summary と stock summary の両方に同じ特殊状況本文
  const dupBody = "・XYZ 特殊状況 監視";
  const entries = parseEntries([special(dupBody), special(dupBody + "  ")]);
  const { kept, droppedDuplicateCount } = dedupeEntries(entries);
  assert.equal(kept.length, 1, "同一論理項目は1回だけ残る");
  assert.equal(droppedDuplicateCount, 1);

  const r = buildConsolidatedMessage([special(dupBody), special(dupBody)], { today: TODAY });
  const occurrences = r.message!.split("XYZ 特殊状況").length - 1;
  assert.equal(occurrences, 1, "統合メッセージ内でも1回だけ掲載");
  assert.equal(r.droppedDuplicateCount, 1);
}

// --- 重複排除キーの衝突リスク: 異なる本文は別キー --------------------------
{
  const a = normalizeKey("💎 特殊状況", "・AAA 監視");
  const b = normalizeKey("💎 特殊状況", "・BBB 監視");
  const c = normalizeKey("📊 銘柄スコア", "・AAA 監視");
  assert.notEqual(a, b, "本文が違えば別キー");
  assert.notEqual(a, c, "セクションが違えば別キー（誤結合しない）");
  // 表記ゆれ（空白/URL）は同一視される
  assert.equal(
    normalizeKey("💎 特殊状況", "・AAA  監視 https://x.example/1"),
    normalizeKey("💎 特殊状況", "・AAA 監視"),
  );
}

// --- urgent のみ（即時通知済みの参照のみ、通常本文なし）---------------------
{
  const r = buildConsolidatedMessage([], { today: TODAY, immediateUrgentCount: 2 });
  assert.ok(r.message, "緊急即時通知があれば参照1行だけの統合を出す");
  assert.ok(r.message!.includes("🚨 緊急 2 件は即時通知済み"));
  assert.equal(r.sections.length, 0, "通常セクションは無い");
}

// --- urgent と normal 混在 -------------------------------------------------
{
  const r = buildConsolidatedMessage([morningLite("1. 📌 7203 トヨタ 62点")], {
    today: TODAY,
    immediateUrgentCount: 1,
  });
  assert.ok(r.message!.includes("🚨 緊急 1 件は即時通知済み"));
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"));
}

// normal のみ（immediateUrgentCount=0 では参照行は出ない）
{
  const r = buildConsolidatedMessage([morningLite("1. 📌 7203 トヨタ 62点")], {
    today: TODAY,
    immediateUrgentCount: 0,
  });
  assert.ok(!r.message!.includes("即時通知済み"));
}

// --- 文字数上限付近 / 全消失しない / 切り詰め可視化 -------------------------
{
  const huge = "あ".repeat(20000);
  const r = buildConsolidatedMessage([morningLite(huge)], { today: TODAY, maxChars: 500 });
  assert.ok(r.message, "巨大入力でも空にはならない（何か残す）");
  assert.ok(r.message!.length <= 500, `上限内に収まる (${r.message!.length})`);
  assert.equal(r.truncated, true, "切り詰めフラグが立つ");
  assert.ok(r.message!.includes("続きはWebで確認"));
  assert.ok(r.message!.includes("🌅 Alpha Pon 朝刊"), "ヘッダは保持される");
}

// --- セクション上限付近: 優先度の高い順に残し、落とした数を報告 -------------
{
  const bulk = "行".repeat(300);
  const r = buildConsolidatedMessage(
    [morningLite(bulk), special(bulk), aiNews(bulk)],
    { today: TODAY, maxChars: 900 },
  );
  assert.ok(r.message!.length <= 900);
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"), "最優先セクションは残る");
  assert.ok(r.omittedSectionCount >= 1, "入り切らないセクションは omitted として報告される");
}

// 通常の上限（デフォルト）でも壊れない
{
  const items = Array.from({ length: 50 }, (_, i) => special(`・銘柄${i} 特殊状況の詳細説明テキスト`));
  const r = buildConsolidatedMessage(items, { today: TODAY });
  assert.ok(r.message!.length <= LINE_MAX_CHARS);
}

// --- リダクション: 秘匿値を出さない ---------------------------------------
{
  const token = "abcd1234TOKENsecretVALUE";
  const userId = "Uxxxxxxxxxxxxxxxxx";
  const text = `error to=${userId} Bearer ${token} failed`;
  const red = redactSecrets(text, [token, userId, undefined, ""]);
  assert.ok(!red.includes(token), "トークンが伏字化される");
  assert.ok(!red.includes(userId), "userId が伏字化される");
  assert.ok(red.includes("***REDACTED***"));
  // Bearer 形式は保険で伏字化
  assert.ok(!/Bearer\s+abcd/.test(red));
}

// --- Transport: 資格情報なし → DryRun（実送信しない）-----------------------
{
  const t = createTransport({} as NodeJS.ProcessEnv);
  assert.equal(t.mode, "dry-run", "資格情報なしは dry-run にフォールバック（実 real モードで送らない）");
  assert.ok(t instanceof DryRunTransport);
}

// LINE_DRY_RUN / NOTIFY_MODE=off でも dry-run
{
  assert.equal(
    createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", LINE_DRY_RUN: "1" } as any).mode,
    "dry-run",
  );
  assert.equal(
    createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", NOTIFY_MODE: "off" } as any).mode,
    "dry-run",
  );
}

// 資格情報ありなら real（ただし本テストでは send しない）
{
  const t = createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y" } as any);
  assert.equal(t.mode, "real");
}

// --- DryRunTransport: 実送信せず記録するだけ -------------------------------
{
  const t = new DryRunTransport();
  const res = await t.send("hello");
  assert.deepEqual(res, { ok: true, mode: "dry-run" });
  assert.deepEqual(t.sent, ["hello"]);
}

// --- LineApiTransport: 全失敗（fetch が throw）でも throw しない ------------
{
  const throwingFetch = (async () => {
    throw new Error("network down secretTOKEN123 leaked");
  }) as unknown as typeof fetch;
  const t = new LineApiTransport("secretTOKEN123", "Uuser", throwingFetch);
  const res = await t.send("msg");
  assert.equal(res.ok, false, "送信失敗は例外にせず結果で返す（pipeline継続可能）");
  if (!res.ok) {
    assert.ok(!res.error.includes("secretTOKEN123"), "エラー文にトークンを出さない");
  }
}

// --- LineApiTransport: 部分失敗（HTTP !ok）でも throw しない ----------------
{
  const badFetch = (async () =>
    ({ ok: false, status: 429, text: async () => "rate limited for Uuser" }) as any) as typeof fetch;
  const t = new LineApiTransport("tok", "Uuser", badFetch);
  const res = await t.send("msg");
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 429);
    assert.ok(!res.error.includes("Uuser"), "応答本文中の userId も伏字化");
  }
}

// --- LineApiTransport: 成功 ------------------------------------------------
{
  let calledUrl = "";
  const okFetch = (async (url: any) => {
    calledUrl = String(url);
    return { ok: true, status: 200, text: async () => "" } as any;
  }) as typeof fetch;
  const t = new LineApiTransport("tok", "Uuser", okFetch);
  const res = await t.send("msg");
  assert.deepEqual(res, { ok: true, mode: "sent" });
  assert.ok(calledUrl.includes("api.line.me"));
}

// SECTION_ORDER は緊急を先頭に置く
assert.equal(SECTION_ORDER[0], "🚨 緊急開示");

console.log("line-consolidation.test.ts: all assertions passed");
