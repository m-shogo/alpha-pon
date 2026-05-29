/* alpha-pon — mock data (調査候補・スコアリング) */
window.AP = (function () {
  // スコア内訳カテゴリ（満点）: 構造30 / 需給25 / 割安15 / テーマ15 / 業績10 / AI5
  const CATS = [
    { key: "structuralEvent", label: "構造イベント", max: 30, color: "var(--lavender)" },
    { key: "supplyDemand",   label: "需給改善",   max: 25, color: "var(--accent)" },
    { key: "valuation",      label: "割安感",     max: 15, color: "var(--sky)" },
    { key: "theme",          label: "テーマ性",   max: 15, color: "var(--butter)" },
    { key: "businessSafety", label: "業績安全性", max: 10, color: "var(--mint)" },
    { key: "aiReview",       label: "AI/手動評価", max: 5,  color: "var(--ink-3)" },
  ];

  const candidates = [
    {
      code: "285A", name: "キオクシア", market: "TSE",
      status: "research", priority: "S",
      tags: ["半導体", "IPO", "国策"],
      rules: ["ipo_selling_pressure_done", "volume_cooling", "no_new_low"],
      price: 1842, changePct: 1.4, drawdownPct: -8,
      score: { structuralEvent: 22, supplyDemand: 24, valuation: 12, theme: 15, businessSafety: 8, aiReview: 4 },
      reasons: [
        "上場から60日以上が経過",
        "出来高が上場初日の25%以下に沈静",
        "直近10日で安値更新なし",
        "半導体 / 国策テーマに合致",
        "PBRが低めの可能性",
      ],
      negativeReasons: [
        "半導体市況の影響が大きい",
        "業績変動リスクあり",
        "大株主の売却余地を要確認",
      ],
      nextToSee: [
        "直近の決算短信",
        "有価証券報告書のリスク情報",
        "大株主構成",
        "ロックアップ解除日",
        "TradingViewチャート",
      ],
      triggeredRule: "IPO後の売り圧力終了",
      lastNotifiedAt: "2026-05-29 07:32",
      sparkline: [100, 96, 91, 88, 84, 83, 81, 80, 82, 85, 84, 86, 88, 87, 90, 92, 91, 94, 96, 100],
    },
    {
      code: "8136", name: "サンリオ", market: "TSE",
      status: "watch", priority: "A",
      tags: ["キャラクター", "グローバルIP", "消費"],
      rules: ["healthy_pullback", "earnings_drop", "earnings_soon"],
      price: 6240, changePct: -1.1, drawdownPct: -18,
      score: { structuralEvent: 12, supplyDemand: 20, valuation: 12, theme: 14, businessSafety: 10, aiReview: 4 },
      reasons: [
        "高値から-18%の調整",
        "売上は前年比プラス",
        "営業利益は大崩れしていない",
        "下方修正なし",
        "グローバルIPテーマ継続",
      ],
      negativeReasons: [
        "為替変動の影響",
        "インバウンド依存度が高い",
        "高値圏からの調整途中",
      ],
      nextToSee: [
        "直近の決算短信",
        "海外ライセンス収益の推移",
        "為替前提の確認",
        "次回決算の予定日",
      ],
      triggeredRule: "高値から-15〜30%下落 + 業績悪化ではない",
      lastNotifiedAt: "2026-05-29 07:32",
      sparkline: [100, 102, 105, 108, 112, 110, 107, 103, 99, 95, 92, 90, 88, 86, 84, 85, 83, 82, 84, 82],
    },
    {
      code: "7012", name: "川崎重工業", market: "TSE",
      status: "research", priority: "A",
      tags: ["防衛", "宇宙", "国策"],
      rules: ["earnings_drop", "structural_event"],
      price: 8910, changePct: 2.2, drawdownPct: -6,
      score: { structuralEvent: 18, supplyDemand: 18, valuation: 10, theme: 15, businessSafety: 9, aiReview: 3 },
      reasons: [
        "防衛 / 宇宙の長期テーマ",
        "事業ポートフォリオ見直しの開示",
        "売上成長が継続",
        "下方修正なし",
      ],
      negativeReasons: [
        "受注の期ズレリスク",
        "原材料コストの影響",
      ],
      nextToSee: ["中期経営計画", "防衛関連受注の開示", "セグメント別利益"],
      triggeredRule: "事業ポートフォリオ見直し",
      lastNotifiedAt: "2026-05-29 07:32",
      sparkline: [88, 90, 89, 92, 94, 93, 95, 96, 98, 97, 99, 100, 98, 99, 97, 98, 100, 99, 98, 100],
    },
    {
      code: "6525", name: "コクサイエレクトロニクス", market: "TSE",
      status: "watch", priority: "B",
      tags: ["半導体", "製造装置"],
      rules: ["healthy_pullback"],
      price: 3120, changePct: -0.4, drawdownPct: -22,
      score: { structuralEvent: 6, supplyDemand: 16, valuation: 11, theme: 12, businessSafety: 8, aiReview: 2 },
      reasons: [
        "高値から-22%の調整",
        "半導体製造装置テーマ",
        "売上は前年比プラス",
      ],
      negativeReasons: ["市況の振れ幅が大きい", "客先集中リスク"],
      nextToSee: ["受注残の推移", "設備投資ガイダンス"],
      triggeredRule: "高値から-15〜30%下落 + 業績悪化ではない",
      lastNotifiedAt: "2026-05-27 07:30",
      sparkline: [100, 101, 99, 97, 94, 92, 90, 88, 85, 83, 82, 80, 78, 79, 80, 78, 79, 81, 80, 78],
    },
    {
      code: "377A", name: "テンプス・スペース", market: "TSE",
      status: "candidate", priority: "B",
      tags: ["宇宙", "IPO"],
      rules: ["ipo_selling_pressure_done"],
      price: 2480, changePct: 0.8, drawdownPct: -12,
      score: { structuralEvent: 14, supplyDemand: 18, valuation: 6, theme: 14, businessSafety: 5, aiReview: 2 },
      reasons: ["上場から60日以上", "出来高の沈静化", "宇宙テーマ"],
      negativeReasons: ["黒字化前の段階", "希薄化リスク"],
      nextToSee: ["四半期の進捗", "資金調達計画", "ロックアップ解除日"],
      triggeredRule: "IPO後の売り圧力終了",
      lastNotifiedAt: "2026-05-29 07:32",
      sparkline: [100, 94, 90, 86, 82, 80, 78, 79, 77, 78, 80, 79, 81, 80, 82, 81, 83, 82, 84, 83],
    },
    {
      code: "4063", name: "信越化学工業", market: "TSE",
      status: "active", priority: "S",
      tags: ["半導体材料", "素材", "高収益"],
      rules: ["earnings_soon"],
      price: 5480, changePct: 0.3, drawdownPct: -4,
      score: { structuralEvent: 4, supplyDemand: 8, valuation: 9, theme: 11, businessSafety: 10, aiReview: 3 },
      reasons: ["高収益体質", "半導体材料テーマ", "業績安定"],
      negativeReasons: ["既に保有中（本命）", "高値圏"],
      nextToSee: ["次回決算", "シリコンウェハ市況"],
      triggeredRule: "決算予定が近い",
      lastNotifiedAt: "2026-05-20 07:30",
      sparkline: [96, 97, 98, 97, 99, 98, 100, 99, 98, 99, 100, 99, 98, 99, 100, 99, 100, 99, 98, 99],
    },
    {
      code: "3697", name: "SHIFT", market: "TSE",
      status: "ignore", priority: "C",
      tags: ["IT", "成長"],
      rules: [],
      price: 1180, changePct: -2.6, drawdownPct: -41,
      score: { structuralEvent: 2, supplyDemand: 6, valuation: 8, theme: 6, businessSafety: 3, aiReview: 1 },
      reasons: ["高値から大幅下落"],
      negativeReasons: ["下方修正あり（業績悪化）", "除外対象", "成長鈍化"],
      nextToSee: ["除外理由の記録"],
      triggeredRule: "—",
      lastNotifiedAt: "2026-05-12 07:30",
      sparkline: [100, 95, 88, 80, 74, 70, 66, 63, 60, 62, 59, 61, 58, 60, 59, 61, 60, 62, 60, 59],
    },
  ];

  // 通知フィード（最新が上）
  const feed = [
    { code: "285A", name: "キオクシア", level: "urgent", score: 85, delta: +12, time: "07:32", date: "2026-05-29",
      reason: "IPO後の売り圧力終了 / 半導体・国策テーマ", suppressed: false },
    { code: "7012", name: "川崎重工業", level: "daily", score: 78, delta: +5, time: "07:32", date: "2026-05-29",
      reason: "事業ポートフォリオ見直しの開示", suppressed: false },
    { code: "8136", name: "サンリオ", level: "daily", score: 72, delta: +3, time: "07:32", date: "2026-05-29",
      reason: "高値から-18% + 業績悪化ではない", suppressed: false },
    { code: "377A", name: "テンプス・スペース", level: "log", score: 63, delta: +1, time: "07:32", date: "2026-05-29",
      reason: "IPO売り圧力の沈静化（ログのみ）", suppressed: false },
    { code: "6525", name: "コクサイエレクトロニクス", level: "log", score: 64, delta: 0, time: "07:30", date: "2026-05-27",
      reason: "3日以内・同理由のため再通知を抑制", suppressed: true },
    { code: "6857", name: "アドバンテスト", level: "daily", score: 71, delta: +8, time: "07:31", date: "2026-05-26",
      reason: "決算翌日の急落 + 長期テーマ", suppressed: false },
  ];

  // Markdownレポート（理想形）
  const report285A = `# 【調査候補】285A キオクシア

> ※これは買い推奨ではありません。**調査候補**です。

**スコア: 85 / 100　通知レベル: urgent**
発火ルール: IPO後の売り圧力終了

## 検出理由
- IPO後60日以上が経過
- 出来高が上場初日の25%以下に沈静
- 直近10日で安値更新なし
- 半導体 / 国策テーマに合致
- PBRが低めの可能性

## 注意点
- 半導体市況の影響が大きい
- 業績変動リスクあり
- 大株主の売却余地を要確認

## 次に見るもの
- 直近の決算短信
- 有価証券報告書のリスク情報
- 大株主構成
- ロックアップ解除日
- TradingViewチャート

## スコア内訳
| カテゴリ | 点数 |
|---|---|
| 構造イベント | 22 / 30 |
| 需給改善 | 24 / 25 |
| 割安感 | 12 / 15 |
| テーマ性 | 15 / 15 |
| 業績安全性 | 8 / 10 |
| AI/手動評価 | 4 / 5 |

---
_生成: alpha-pon ・ 2026-05-29 07:32 ・ データ品質: ok_`;

  return { CATS, candidates, feed, report285A,
    total: (s) => Object.values(s).reduce((a, b) => a + b, 0) };
})();
