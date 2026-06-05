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

### キオクシアは参考例の1つ

キオクシア(285A)は:
- 東芝からのcarve-out
- Bain CapitalによるPE保有後のIPO
- 上場後のロックアップ・需給イベント
- NANDサイクル回復の確認

という複数の特殊状況が重なった例として使う。
**「キオクシアのような銘柄を探す」ための型が、このウォッチの目的。**

---

## 見るべき王道パターン

| パターン | 概要 |
|---|---|
| `carve_out_ipo` | 大企業由来の重要事業が切り出されて上場 |
| `pe_exit_ipo` | PEファンド保有後のIPO。出口売りとロックアップが論点 |
| `spin_off` | 親会社から独立。親会社株主の機械的売りに注意 |
| `post_ipo_lockup_overhang` | 上場後ロックアップ解除・売り圧通過待ち |
| `major_holder_exit_overhang` | 親会社/政府/PEの大量売却による需給圧迫 |
| `cycle_recovery` | 市況サイクル回復型（メモリ・半導体・素材等） |
| `parent_subsidiary_reorg` | 親子上場解消・TOB候補。TOB期待過熱に注意 |
| `government_privatization_ipo` | 政府・自治体保有の民営化IPO |
| `small_ticket_overlay` | **補助条件のみ**。単価安さを割安と混同しない |

---

## チャンス候補とは何か

チャンス候補は**買い推奨ではありません**。

チャンスっぽいと判断するのは、以下の両方が揃った場合のみ:
1. **なぜチャンスっぽいか** (whyInteresting) が明確
2. **何が危ないか** (whyDangerous) も同時に表示されている

### チャンスだと思った瞬間ほど、リスクと待つ理由を横に置く

TOPに出るのは:
- なぜチャンスっぽいか
- 何が危ないか
- 次に何を確認するか

この3つを**同時**に見ることが目的。

---

## notificationEligible の条件

以下の**全て**を満たす場合のみ `notificationEligible: true`:

- `finalLabel` が「チャンス候補」または「調査優先候補」
- `chanceLevel` が `attention` または `high`
- `whyDangerous` が空でない（リスクも表示できている）
- `evidenceNeeded` が空でない
- `sampleTooSmall` が `false`（サンプル不足では強い通知にしない）

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

---

## 運用コマンド

```bash
# レポート生成
pnpm watch:special

# UIデータ反映
pnpm ui:data

# チェック全体
pnpm check
```

---

## 出力

- `reports/special_situation_watch_latest.json` — 機械可読JSON
- `reports/special_situation_watch_latest.md` — 人間可読Markdown
- TOP画面 — 特殊状況・チャンス候補セクション

*※売買推奨ではありません。調査候補です。証拠確認が必要です。*
