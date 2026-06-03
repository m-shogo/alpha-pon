# alpha-pon ローカル検証チェックリスト

帰宅後に迷わず確認するためのチェックリスト。

## まず実行

```bash
cd /Users/m-shogo/Developer/personal/alpha-pon
bash scripts/verify-pro-local.sh
```

このスクリプトは以下を実行する。

1. `pnpm pro:all`
2. `pnpm ui:data`
3. `tests/pro-disagreement.test.ts`
4. `tests/pro-generated-data-shape.test.ts`
5. `scripts/inspect-pro-output.mjs`
6. 主要生成ファイルの存在確認

## 次に全体確認

```bash
pnpm check
pnpm health
pnpm backup
```

余裕があれば:

```bash
pnpm check:all
```

## 必ず見るファイル

```text
reports/stock_pro_committee_latest.md
reports/stock_pro_committee_latest.json
apps/web/public/generated/alpha-pon-data.json
```

## stock_pro_committee_latest.json で見る項目

各 decision に以下が入っているか。

```text
code
name
originalFinalLabel
finalLabel
finalScore
verdicts
legendVerdicts
consensus
disagreements
nextActions
blockers
missingEvidence
```

## alpha-pon-data.json で見る項目

```text
legendProCommittee
legendProCommittee.decisions
legendProCommittee.decisions[].consensus
legendProCommittee.decisions[].disagreements
buffettQuality
valuationSnapshots
irEventEvidence
stockProCommitteeJson
```

## ラベル判定の見方

### agreementLevel の意味に注意

`agreementLevel: high` は **「良い判断」という意味ではない。**

`agreementLevel` と `finalLabel` は **必ずセットで読む。**

| agreementLevel | finalLabel | 意味 |
|---|---|---|
| `high` | `証拠不足` | 全員が情報不足で一致 → 情報収集が先 |
| `high` | `調査候補` | 全員が良いと見ている → 前向きな一致 |
| `high` | `保留` | 全員が様子見で一致 → 理由を確認 |
| `mixed` | 何でも | 賛成と慎重が混在 → finalScore だけで判断しない |
| `conflict` | 何でも | 強い対立 → 先に disagreements を読む |

**証拠不足 ≠ 悪い銘柄。情報が足りないだけ。**
`missingEvidence` を埋めてから再実行すれば `finalLabel` が変わる可能性がある。

### OKに近い

```text
originalFinalLabel: 調査候補
finalLabel: 保留
consensus.agreementLevel: mixed
```

意味: もともとは良さそうだが、先生の意見が割れているので慎重にした。

### 証拠集め優先

```text
finalLabel: 証拠不足
consensus.agreementLevel: high  ← 全員が情報不足で一致しているだけ (良い意味ではない)
```

見ること:

- missingEvidence
- disagreements
- cautiousAgents
- IRイベントURL
- バリュエーション未取得
- 検証件数不足

### 本当に注意

```text
finalLabel: 避ける
```

見ること:

- consensus.blockingAgents
- blockers
- どの先生が避ける判定を出したか

## inspect-pro-output の見方

`bash scripts/verify-pro-local.sh` の中で以下が表示される。

```text
finalLabel 分布
originalFinalLabel 分布
agreementLevel 分布
decisions with disagreements
label adjusted by safety rule
cautiousAgents
blockingAgents
disagreement topics
legendProCommittee.decisions 件数
```

### 変だと感じるパターン

```text
避ける が多すぎる
証拠不足 がほぼ全件
agreementLevel が conflict ばかり
committee decisions と UI decisions の件数が違う
legendProCommittee が空
```

この場合は、まず以下を確認する。

```bash
pnpm pro:all
pnpm ui:data
node scripts/inspect-pro-output.mjs
```

## 大事な安全ルール

- 先生の意見を平均点に潰さない。
- `consensus.agreementLevel` が `mixed` / `conflict` の時は、finalScore だけで見ない。
- `originalFinalLabel` と `finalLabel` が違う時は、なぜ安全側に倒されたかを見る。
- `証拠不足` は悪い銘柄という意味ではなく、まだ情報が足りないという意味。
- `避ける` は強い反対理由がある時だけにしたい。

## 最後にコミットする場合

生成JSONをcommit対象にするかは運用方針次第。

手元確認だけなら commit 不要。

Web UIを最新化して公開・デプロイしたい場合:

```bash
git status
git add apps/web/public/generated/
git commit -m "chore: update generated alpha-pon data"
git push
```

DBや `data/` の生データは基本的に慎重に扱う。
