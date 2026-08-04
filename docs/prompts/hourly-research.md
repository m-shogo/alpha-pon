# 毎時研究プロンプト（ChatGPT Scheduled Tasks 用）

このファイルが **ChatGPT に渡すプロンプトの正本** です。
プロンプトを変えるときは、このファイルを更新してから ChatGPT 側に反映してください。

- 研究するのは ChatGPT。Research OS は器で、研究はしません。
- GitHub Actions は整合性チェックと生成物更新だけを行い、Edge の作成・昇格は行いません。
- Research OS の仕様: [../research/research-os-spec.md](../research/research-os-spec.md)

---

## 1. 開始（必ずこの順で読む）

1. `research/checkpoint/latest.json` — **前回の続き**。`nextCandidates` が今回の出発点。
2. `research/queue/queue.generated.json` — **今回研究するテーマ**。原則 `rank: 1` を研究する。
   - 1位以外を選ぶ場合は、Research Log の `queueRank` と `queueOverrideReason` に理由を必ず書く。
3. `research/dashboard/dashboard.generated.md` — 全体像（Idea/Research/Shadow/Production/Rejected/Promotion Ready/Holdout Ready）。
4. `research/edge_registry/edges/<選んだ edge>.yml` — 研究対象の詳細。

Queue が空（Edge が 0 件）のときだけ、新しい Edge を 1 件作ることから始める。

## 2. 研究する（ここは OS の管轄外）

情報源は一次情報のみ。SNS・掲示板・匿名投稿・インフルエンサーは
**スキーマの `sourceType` に存在しない**ため、書こうとすると CI が落ちます。

使える出典: 会社IR / TDnet / JPX / EDINET / 有価証券報告書 / 決算資料 / 金融庁 /
各省庁 / 裁判資料 / 行政資料 / 主要報道 / 市場データ / Historical DB / 学術文献。

## 3. 書き込み契約（GitHub に置くファイル）

ChatGPT は **ファイルを書くだけ** で研究を積み上げられます。CLI の実行は不要です。
CI が検証し、生成物（`*.generated.*`）は CI が更新します。**生成物は手で書かないでください。**

| やったこと | 書く場所 | 形式 |
| --- | --- | --- |
| Edge を作った | `research/edge_registry/edges/<id>.yml` | 新規ファイル |
| Edge を更新した | 同上（`hypothesis` / `id` / `createdAt` は変更禁止） | 既存ファイル更新 |
| 過去事例を足した | `research/historical/analogs/<id>.yml` | 新規ファイル（**作成後は変更禁止**） |
| 反実仮想を足した | `research/counterfactual/counterfactuals.jsonl` | **末尾に1行追記** |
| 交絡因子を足した | `research/confounder/confounders.jsonl` | **末尾に1行追記** |
| 今回の作業記録 | `research/research_log/YYYY-MM.jsonl` | **末尾に1行以上追記** |
| 次回への引き継ぎ | `research/checkpoint/latest.json` と `research/checkpoint/history/<savedAt>-seq<N>.json` | 上書き＋新規 |

### 絶対に守ること（守らないと CI が落ちる）

- `.jsonl` は **末尾追記のみ**。既存行の書き換え・削除・並べ替えは違反。
- `historical/analogs/*.yml` と `checkpoint/history/*.json` は **作成後 1 文字も変えない**。
- Edge の `hypothesis` は immutable。仮説を変えたくなったら **新しい Edge** を作る。
- `promotionGate` の `pass` には必ず `evidence` を書く。根拠のない `pass` は落ちる。
- `observedAt` は「その情報が公に入手可能になった時刻」。イベント日より前にはできない。
- 未来の日付・時刻は書けない。
- Holdout 期間（`research/holdout/vault.manifest.json`）の事例を研究に使わない。

### Checkpoint の書き方

`latest.json` の `sequence` を +1 して上書きし、**同じ内容**を
`research/checkpoint/history/<savedAt をファイル名安全にした文字列>-seq<N>.json` にも新規作成する。

```json
{
  "schemaVersion": 1,
  "sequence": 12,
  "savedAt": "2026-08-04T10:00:00+09:00",
  "actor": "chatgpt-hourly",
  "researchedEdgeId": "<今回研究した Edge>",
  "researchDone": "今回行った研究を具体的に",
  "addedAnalogIds": ["<追加した Historical Analog>"],
  "rejections": [{ "target": "<棄却した仮説や候補>", "reason": "棄却理由を具体的に" }],
  "dataGaps": ["不足しているデータ"],
  "nextCandidates": [{ "edgeId": "<次にやる Edge>", "why": "なぜ次にそれか" }],
  "openQuestions": [],
  "osIssues": ["Research OS 自体の不便な点があればここに"]
}
```

`nextCandidates` は **空にできません**。次回が必ず前回の続きから始まるための仕組みです。

## 4. 毎時の最低ノルマ

1 時間で最低 1 つ、以下のどれかで研究を前進させる。

- Historical Analog を 1 件以上追加した
- 既存 Edge の Production Gate 項目を 1 つ以上 `unknown` から動かした（根拠付き）
- Edge 候補を 1 件棄却し、理由を残した
- 不足データを特定し、`dataGaps` に具体的に記録した

**何も進まなかった時間** は、Research Log に `type: "data_gap"` で
「何を試して、なぜ進まなかったか」を残す。空振りも記録すれば次回の資産になります。

## 5. 終了時のチェックリスト

- [ ] Research Log に 1 行以上追記したか
- [ ] Checkpoint を更新し、`nextCandidates` を書いたか
- [ ] 追加した記録の出典はすべて一次情報か
- [ ] 生成物（`*.generated.*`）を手で編集していないか
- [ ] 既存の `.jsonl` や Analog を書き換えていないか

## 6. 通知してよいもの

重大不祥事 / Named Watch 更新 / Production 昇格候補 / Edge 棄却 /
Net Alpha の大幅改善 / 重要研究成果 のみ。それ以外は Dashboard に載れば十分です。

## 7. ローカルで検証する場合（任意）

```bash
pnpm research:check
```

個別に実行する場合:

```bash
pnpm research:validate        # スキーマ・重複・PIT・Gate・Decay
pnpm research:queue:top       # 今研究すべき1件
pnpm research:generate        # index / queue / dashboard を再生成
pnpm research:check:history   # Append Only と不変性
```
