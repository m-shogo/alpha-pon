# Pro委員会 食い違い検出 ロードマップ

> 買い推奨ではありません。調査・検証・反証・学習用。

## 概要

複数の株Proエージェント（先生）が同じ銘柄を独立して判定し、
合意・食い違い・不足情報を可視化するシステム。

- **買い推奨はしない**
- **先生の意見を平均点に潰さない** — `consensus / disagreements` を通じて個別の意見を保持する
- **`originalFinalLabel` と `finalLabel` を分ける** — 安全ルール適用前後を区別する
- **`mixed / conflict` のとき `finalScore` だけで判断しない** — `disagreements` を先に確認する

---

## アーキテクチャ

```
config/stock-pro-agents.yml          エージェント定義
config/company-hypotheses.yml        仮説・銘柄リスト
config/company-network.yml           ネットワーク情報
config/company-ir-events.yml         IRイベント情報
     ↓
src/stock-pro-committee-report.ts    委員会レポート生成
     ↓
reports/stock_pro_committee_latest.json  JSON出力 (全フィールド)
reports/stock_pro_committee_latest.md   MD出力
     ↓
src/pro-ui-data-addon.ts             UI向けデータ変換
     ↓
apps/web/public/generated/alpha-pon-data.json  (legendProCommittee等を追加)
```

---

## 主要フィールド

| フィールド | 説明 |
|---|---|
| `originalFinalLabel` | 安全ルール適用前のラベル（多数決ベース） |
| `finalLabel` | 安全ルール適用後のラベル（blockがあれば"避ける"に倒す） |
| `consensus` | `full_agree` / `mostly_agree` / `mixed` / `conflict` |
| `disagreements` | 食い違いの詳細（topic / agents / stances / description） |
| `legendVerdicts` | legend tier エージェント（buffett/valuation/risk_manager）の判定 |
| `legendWarnings` | legend tierからの警告メッセージ |
| `verdicts` | 全エージェントの個別判定 |
| `nextActions` | 次に確認すること |
| `blockers` | ブロック理由 |
| `missingEvidence` | 不足情報 |

---

## 安全ルール

```typescript
// 避けると判定したエージェントが1人でもいればfinalLabelを"避ける"に上書き
const isBlock = (v) => v.stance === "避ける";
const finalLabel = verdicts.some(isBlock) ? "避ける" : originalFinalLabel;

// 証拠不足は"避ける"扱いにしない（情報が足りないだけ）
const isEvidenceGap = (v) => v.stance === "証拠不足";
```

- `証拠不足` は「悪い銘柄」ではなく「情報が足りない」状態
- `避ける` は「強い反対理由がある」時だけ使う
- 平均スコアに潰すのではなく、食い違いそのものを`disagreements`に残す

---

## legend tier エージェント

以下の3エージェントは "legend tier" として特別扱いする:

- `buffett_quality_agent` — 財務品質・競争優位チェック
- `valuation_agent` — 過熱・バリュエーションチェック
- `risk_manager_agent` — 安全性チェック

これらの判定が `legendVerdicts` と `legendWarnings` に反映される。

---

## UI向け出力フィールド (alpha-pon-data.json)

| フィールド | 内容 |
|---|---|
| `legendProCommittee` | 軽量版committee（consensus/disagreements付き） |
| `legendProCommittee.decisions[].consensus` | 合意レベル |
| `legendProCommittee.decisions[].disagreements` | 食い違いの詳細 |
| `buffettQuality` | buffett_quality_agentの判定一覧 |
| `valuationSnapshots` | valuation_agentの判定一覧 |
| `irEventEvidence` | event_driven_agentの判定一覧 |
| `stockProCommitteeJson` | 全フィールド版（フルデータ） |

---

## 実行コマンド

```bash
# Pro委員会レポート生成
pnpm pro:committee

# UIデータ生成 (legendProCommittee等を含む)
pnpm ui:data

# ローカル検証 (上記 + テスト + インスペクト)
pnpm verify:pro:local
# または
bash scripts/verify-pro-local.sh

# インスペクト出力のみ
pnpm inspect:pro

# 完全検証 (typecheck + test + pro:all + ui:data + pro tests)
pnpm verify:pro
```

---

## 判定バランスのチェック

`pnpm inspect:pro` の出力で以下を確認する:

| チェック項目 | 注意するパターン |
|---|---|
| `避ける` 比率 | 50%超なら isBlock 条件を確認 |
| `証拠不足` 比率 | 90%超なら一次情報登録が必要 |
| `conflict` 比率 | 多すぎる場合はエージェント設定を見直す |
| `committee` vs `UI` 件数 | 一致していること |
| `legendProCommittee` | null ではないこと |

---

## ファイル一覧

| ファイル | 役割 |
|---|---|
| `src/pro-types.ts` | 型定義 |
| `src/pro-disagreement.ts` | 食い違い検出ロジック |
| `src/stock-pro-committee-report.ts` | 委員会レポート生成 (MD + JSON) |
| `src/pro-ui-data-addon.ts` | UI向けデータ変換 |
| `tests/pro-disagreement.test.ts` | 食い違い検出テスト |
| `tests/pro-generated-data-shape.test.ts` | 生成JSONの形検査 |
| `scripts/inspect-pro-output.mjs` | インスペクタ |
| `scripts/verify-pro-local.sh` | ローカル検証スクリプト |
| `docs/local-verification-checklist.md` | ローカル検証チェックリスト |
