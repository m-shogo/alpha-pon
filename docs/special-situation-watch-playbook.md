# alpha-pon 特殊状況・時間差再評価ウォッチ プレイブック

## 目的

carve-out / PE出口 / spin-off / lockup / cycle recovery などの**王道パターン**を、
調査優先候補・監視候補として蓄積し、チャンスっぽい局面では**理由付きで**TOP表示と通知に出す。

これは**買い推奨ではありません**。

---

## 基本姿勢

### 安い株探しではない

- 単価が安い ≠ 割安
- 最低売買金額は監視のしやすさの補助情報にすぎない
- 「小さいから買いやすい」は理由にならない
- **低位株ランキング・テンバガー候補・SNS急騰株として使うことは禁止**

### キオクシアは参考例の1つ

キオクシア(285A)は:
- 東芝からのcarve-out
- Bain CapitalによるPE保有後のIPO
- 上場後のロックアップ・需給イベント
- NANDサイクル回復の確認

という複数の特殊状況が重なった例として使う。
**「キオクシアのような銘柄を探す」ための型が、このウォッチの目的。**

---

## パターン優先度

9パターンは全て同格ではない。以下の優先度で使う。

### Sランク（最初に見る王道パターン）

| パターン | 概要 |
|---|---|
| `carve_out_ipo` | 大企業由来の重要事業が切り出されて上場 |
| `pe_exit_ipo` | PEファンド保有後のIPO。出口売りとロックアップが論点 |
| `post_ipo_lockup_overhang` | 上場後ロックアップ解除・売り圧通過待ち |
| `major_holder_exit_overhang` | 親会社/政府/PEの大量売却による需給圧迫 |
| `cycle_recovery` | 市況サイクル回復型（メモリ・半導体・素材等） |

### Aランク（補助的に見る）

| パターン | 概要 |
|---|---|
| `spin_off` | 親会社から独立。親会社株主の機械的売りに注意 |
| `parent_subsidiary_reorg` | 親子上場解消・TOB候補。TOB期待過熱に注意 |
| `government_privatization_ipo` | 政府・自治体保有の民営化IPO |

### 補助条件（単独では使わない）

| パターン | 注意 |
|---|---|
| `small_ticket_overlay` | **単独パターンとして使わない。** 上記S/Aランクが先にある場合のみ付ける。 |

---

## `small_ticket_overlay` の正しい使い方

### 単独使用は禁止

`small_ticket_overlay` は**単体では候補の根拠にならない**。

- 「株価が安い」だけで候補にしない
- 「最低購入金額が低い」だけで候補にしない
- 低位株ランキング・テンバガー候補・SNS急騰株への流用は禁止

### 正しい使い方

`carve_out_ipo` / `pe_exit_ipo` / `post_ipo_lockup_overhang` / `major_holder_exit_overhang` / `cycle_recovery` など、
**特殊状況の本体パターンが先にある場合だけ**、補助情報として付与する。

```
例: キオクシア(285A)
  - carve_out_ipo ← 本体
  - pe_exit_ipo   ← 本体
  - cycle_recovery ← 本体
  - small_ticket_overlay ← 少額で監視しやすいという補助情報
```

単価が安い = 割安 **ではない**。

---

## `whyNow` / `whyNotNow` — 今見る理由・今待つ理由

### なぜこの2項目が必要か

「なぜ面白いか」だけではチャンスに見える。  
**「今見る理由」と「今待つ理由」を両方出すことで、冷静になれる。**

| 項目 | 意味 |
|---|---|
| `whyNow` | なぜ今見るのか（例: 市況反転兆候・ロックアップ解除接近・決算確認タイミング） |
| `whyNotNow` | なぜ今はまだ待つのか（例: PE出口売りが残る・FCF未確認・証拠が弱い） |

### 使い方のルール

- `whyNow` だけで通知しない。`whyNotNow` も必ず表示する
- `notificationEligible: true` にするには `whyNotNow` が空でないこと
- TOP画面でも「なぜ今見る」と「まだ待つ理由」を並べて表示する

### 例: キオクシア (285A)

```
whyNow:
  - NAND / SSD / eSSD 市況の反転確認が近い局面
  - AI推論ストレージ需要が業績に届くか確認できる段階

whyNotNow:
  - PE/既存株主の売り圧がまだ残る可能性
  - FCF改善が未確認・設備投資負担が重い
  - AI需要がNAND単価改善まで届く証拠がまだ必要
```

---

## チャンス候補とは何か

チャンス候補・調査優先候補は**買い推奨ではありません**。

チャンスっぽいと判断するのは、以下の両方が揃った場合のみ:
1. **なぜチャンスっぽいか** (whyInteresting) が明確
2. **何が危ないか** (whyDangerous) も同時に表示されている

### チャンスだと思った瞬間ほど、リスクと待つ理由を横に置く

TOPに出るのは:
- なぜチャンスっぽいか
- 何が危ないか
- 次に何を確認するか

この3つを**同時**に見ることが目的。TOP表示も通知も調査優先の合図であり、売買の合図ではない。

---

## `notificationEligible` と `chanceLevel` の運用ルール

### chanceLevel 別の扱い

| chanceLevel | 扱い |
|---|---|
| `none` | TOP表示なし / 通知なし |
| `watch` | TOP表示のみ。通知しない。 |
| `attention` | TOP表示のみ。基本通知しない。 |
| `high` | 通知候補。ただし以下の全条件を満たす場合のみ。 |

### `notificationEligible: true` の全条件

以下の**全て**を満たす場合のみ `notificationEligible: true`:

1. `finalLabel` が「チャンス候補」または「調査優先候補」
2. `chanceLevel` が `attention` または `high`
3. `whyDangerous` が空でない（リスクも表示できている）
4. `evidenceNeeded` が空でない
5. `sampleTooSmall` が `false`（サンプル不足では強い通知にしない）

### `sampleTooSmall` は強い通知にしない

- `hypothesis_outcomes.jsonl` のサンプルが `minSampleSize`（デフォルト5件）未満の場合は `sampleTooSmall: true`
- `high` 通知でも `sampleTooSmall` なら `notificationEligible: false`
- サンプルが蓄積されるまでは方向感の参考値として使い、強い通知の根拠にしない

---

## reference events の扱い

SpaceX / Starlink / OpenAI / Anthropic のような**未上場イベント**は、
直接銘柄ではなく `referenceEvents` として管理する。

**必ず `confidence` を設定する:**
- `official` — 公式発表・S-1提出等
- `reported` — 報道
- `rumor` — 噂・未確認情報
- `unknown` — 不明

**`confidence: reported/rumor` の情報は強い判断に使わない。**

---

## 安全ルール

- 安い株探しではない
- 単価が安い = 割安ではない
- 報道だけでは強い通知に上げない
- 上場週・ロックアップ前後は需給イベントとして観察
- 公式情報か報道か噂かを必ず分ける
- `sampleTooSmall` は強い判断の根拠にしない
- `small_ticket_overlay` は単独パターンとして使わない

---

## 運用コマンド

```bash
# レポート生成
pnpm watch:special

# UIデータ反映
pnpm ui:data

# 毎朝の完全版（daily:full に含まれる）
pnpm daily:full

# チェック全体
pnpm check
```

---

## 出力

- `reports/special_situation_watch_latest.json` — 機械可読JSON
- `reports/special_situation_watch_latest.md` — 人間可読Markdown
- TOP画面 — 特殊状況・調査優先候補セクション（最大5件表示）

---

## 次フェーズ候補（設計メモ）

現在は未実装。将来の拡張として検討中。

### `whyNow` / `whyNotNow`

```
whyNow: なぜ今見るのか（例: 「ロックアップ解除が3ヶ月後に迫っている」）
whyNotNow: なぜ今は待つのか（例: 「NANDの在庫水準がまだ高い」「PE残保有率が高い」）
```

現在は `waitFor` で代替しているが、「今見る理由」と「今待つ理由」を分けると
より明確な判断の補助になる可能性がある。

### `sellerPressureProfile`

```
sellerPressureProfile:
  who: 誰が売っているか
  why: なぜ売っているか
  remaining: まだ売り圧が残るか（high/medium/low/cleared）
  estimatedCleared: 売り圧通過の目安時期
```

現在は `sellerPressure: high/medium/low/unknown` の1フィールドだが、
誰がなぜ売っているかを分けると、需給分析の精度が上がる可能性がある。

### `themeCompanyFitReview`

```
themeCompanyFitReview:
  theme: テーマ（例: AIストレージ）
  company: 銘柄（例: キオクシア）
  verdict: テーマは当たったが銘柄は外れた / 両方当たった / etc.
  missReason: 銘柄が外れた理由
```

「テーマとしての仮説は正しかったが、銘柄選定が間違っていた」という学習を蓄積するため。

---

*※売買推奨ではありません。調査候補です。証拠確認が必要です。*
