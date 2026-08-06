# Recommendation & Outcome Persistence Contract v0 (draft)

Status: `CONTRACT_DRAFT_NOT_IMPLEMENTED`
Updated: 2026-08-05 JST
Depends on: [PIT Price Store v1](pit-price-store.md), Research OS Registry / Backtest / Gate

## Why this exists

Alpha Pon は投資判断まで支援するシステムであり、十分な根拠がある場合は
BUY候補 / WATCH / WAIT / AVOID と価格シナリオを提示してよい。ただし判定を
出す瞬間の条件を固定保存し、後から答え合わせできることを必須とする。

このドキュメントは実装前の契約定義である。実コード・実発注は含まない。
自動発注は本契約の対象外であり、証券口座への注文はユーザーの明示操作でのみ行う。

禁止するのは推奨そのものではなく、以下:

- 根拠なき断定（「絶対に上がる」等）
- 古い情報を現在の事実として使う
- SNS・匿名情報だけで BUY 判定する
- 確率・価格帯・目標価格の捏造
- 発表後に予想条件を都合よく書き換える
- 外れた予想や失敗した Edge を削除する
- 未検証の catalog Edge だけで BUY を出す

## Evidence separation (必須)

すべての推奨は、本文中で以下を分離して提示する。混在させない。

```text
新しく確認された事実
既に知られていた事実
仮定・推論
予想
意見
```

## Evidence tiers (BUY/確率/スコアへ使う場合は明示)

```text
Tier A  IR / TDnet / EDINET / JPX / 官公庁 / 監査資料 / 法定資料
Tier B  取引所公式統計 / 客観的人流 / POS / 予約 / 検索 / 交通 / 需給 / 設備投資
Tier C  確認済み企業公式SNS / 公式動画 / 説明会補足
Tier D  一般報道 / 技術記事 / 業界解説
Discovery only  一般SNS / 匿名投稿 / 掲示板 / 感情 / 推奨 / 噂
```

一般SNS・匿名情報だけでは BUY へ昇格させない。BUY に用いた最上位 Tier を記録する。

## Recommendation record (発表時点で固定保存)

append-only。発表時の価格・価格帯・期間・反証条件を後から上書きしない。
変更は revision として追記し、旧 record を破棄しない。

```ts
type RecommendationRecord = {
  recommendationId: string;
  issuedAt: string;            // 発表時刻
  informationCutoff: string;   // この時刻以降の情報は当初判断へ混ぜない
  code: string;
  companyName: string;
  currentPrice: number;
  decision: "BUY" | "WATCH" | "WAIT" | "AVOID";
  buyRange?: [number, number];
  targetRange?: [number, number];
  timeHorizon: string;
  confidence?: number;         // 計算根拠が無ければ省略（捏造しない）
  bullScenario: string;
  baseScenario: string;
  bearScenario: string;
  scenarioProbabilities?: { bull: number; base: number; bear: number };
  catalysts: string[];
  risks: string[];
  confirmationConditions: string[];  // 買う前の確認条件
  invalidationRules: string[];       // 仮説が崩れる条件
  exitConditions: string[];          // 撤退条件
  sourceEvidence: { tier: "A" | "B" | "C" | "D"; ref: string }[];
  edgeIds: string[];           // validated / active-research Edge のみ
  benchmark: string;           // 例: TOPIX
  sectorBenchmark: string;     // 例: TOPIX-17
  positionSizingRationale?: string;
  outcomeReviewDate: string;
  status: "open" | "target_reached" | "invalidated" | "expired" | "reviewed";
  supersedesId?: string;       // revision chain
};
```

不変条件:

- `informationCutoff` 以降に判明した情報を当初判断へ混ぜない。
- `currentPrice` / `buyRange` / `targetRange` / `timeHorizon` / `invalidationRules`
  を後から書き換えない。変更は `supersedesId` を持つ新 record として追記。
- `confidence` / `scenarioProbabilities` / `targetRange` は計算根拠が無ければ出さず、
  「価格帯算出不可 / 確率算出不可 / 追加確認が必要」と正直に記録する。
- catalog 段階の Edge だけで `decision: "BUY"` を出さない。
- 価格は [PIT Price Store](pit-price-store.md) の `firstExecutableAt` 境界に従う。

## Outcome record (答え合わせ、後日追記)

```ts
type OutcomeRecord = {
  recommendationId: string;
  maxReturn: number;
  maxDrawdown: number;
  benchmarkExcessReturn: number;   // TOPIX / 業種指数との差
  targetReached: boolean;
  invalidationTriggered: boolean;
  reviewedAt: string;
  verdict: "correct" | "partly_correct" | "incorrect" | "inconclusive";
  correctAssumptions: string[];
  incorrectAssumptions: string[];  // 見落とし・誤りも必ず残す
  missingEvidence: string[];
  unexpectedConfounders: string[];
  lessons: string[];
  nextRuleChanges: string[];
};
```

答え合わせは PIT Price Store の issuer / benchmark / sector benchmark 系列を用い、
`issuedAt` 以降の価格のみで `maxReturn` / `maxDrawdown` / 超過収益を計測する。
外れた予想・失敗 Edge も削除せず Git に残し、学習へ回す。

## Output format (提示テンプレート)

```text
判定: BUY候補 / WATCH / WAIT / AVOID
現在価格 / 買い検討価格帯 / 基本・強気・弱気の価格帯
想定期間 / 推奨確度（根拠が無ければ「算出不可」）
新規事実 / 既知事実 / 仮定・推論 / 予想 / 意見
使用Edge / 主要な証拠(Tier) / 主要カタリスト / 主なリスク
買う前の確認条件 / 仮説が崩れる条件 / 見送り条件 / 撤退条件
次の重要イベント / 次回レビュー日
```

根拠が弱い場合は BUY へ昇格させず WATCH で正直に出す。

## Definition of done (将来PR)

- [ ] `RecommendationRecord` / `OutcomeRecord` schema + validator
- [ ] append-only writer と revision(`supersedesId`) chain 検証
- [ ] evidence tier 必須化と Discovery-only 除外の enforcement
- [ ] catalog-only Edge での BUY 拒否
- [ ] PIT Price Store 由来の maxReturn / maxDrawdown / 超過収益 計測
- [ ] outcome review 期日判定（target / invalidation / expiry）
- [ ] synthetic fixture と PIT-safe tests
- [ ] 外れ予想・失敗 Edge の非削除保証テスト
