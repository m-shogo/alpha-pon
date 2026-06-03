# ローカル検証チェックリスト

> 買い推奨ではありません。調査・検証・反証・学習用。

Pro委員会・食い違い検出・UI連携のローカル検証手順です。

---

## 一発実行

```bash
bash scripts/verify-pro-local.sh
# または
pnpm verify:pro:local
```

---

## ステップ別チェックリスト

### 1. Pro委員会レポート生成

```bash
pnpm pro:committee
```

確認ポイント:
- [ ] `reports/stock_pro_committee_latest.md` が生成されている
- [ ] `reports/stock_pro_committee_latest.json` が生成されている
- [ ] `decisions` 配列に銘柄が入っている
- [ ] 各 decision に `originalFinalLabel` / `finalLabel` がある
- [ ] 各 decision に `consensus` / `disagreements` がある
- [ ] `legendVerdicts` / `legendWarnings` がある

### 2. UIデータ生成

```bash
pnpm ui:data
```

確認ポイント:
- [ ] `apps/web/public/generated/alpha-pon-data.json` が更新されている
- [ ] `legendProCommittee` フィールドが存在する (null でない)
- [ ] `legendProCommittee.decisions` に銘柄が入っている
- [ ] `legendProCommittee.decisions[].consensus` がある
- [ ] `legendProCommittee.decisions[].disagreements` がある
- [ ] `buffettQuality` フィールドが存在する
- [ ] `valuationSnapshots` フィールドが存在する
- [ ] `irEventEvidence` フィールドが存在する
- [ ] `stockProCommitteeJson` フィールドが存在する

### 3. テスト実行

```bash
node --import tsx/esm tests/pro-disagreement.test.ts
node --import tsx/esm tests/pro-generated-data-shape.test.ts
```

確認ポイント:
- [ ] `pro-disagreement.test.ts passed`
- [ ] `pro-generated-data-shape.test.ts passed`

### 4. インスペクト確認

```bash
pnpm inspect:pro
# または
node scripts/inspect-pro-output.mjs
```

確認ポイント:
- [ ] `finalLabel 分布` が表示される
- [ ] `originalFinalLabel 分布` が表示される
- [ ] `agreementLevel 分布` が表示される
- [ ] `disagreements あり` の件数が確認できる
- [ ] `安全ルールでラベル変更された銘柄` の件数が確認できる
- [ ] `committee と UI decisions 件数が一致` と表示される
- [ ] 判定バランスで `避ける 50%超` の警告が出ていない
- [ ] 判定バランスで `証拠不足 90%超` の警告が出ていない

---

## 全体チェック

```bash
pnpm check          # typecheck + tests
pnpm verify:pro     # pro:all + ui:data + pro tests
pnpm health         # ヘルスチェック
pnpm backup         # バックアップ
```

---

## 注意点

- `避ける` が多すぎる場合: `src/pro-disagreement.ts` の `isBlock` 関数が `stance === "避ける"` のみを判定しているか確認
- `証拠不足` を `避ける` と同扱いにしない: `isEvidenceGap` と `isBlock` は別関数
- `mixed / conflict` のとき: `finalScore` だけで判断せず `disagreements` の内容を確認する
- `originalFinalLabel !== finalLabel` の銘柄: 安全ルールが適用されているため理由を確認する

---

## 関連ドキュメント

- [docs/roadmap-pro-disagreement.md](roadmap-pro-disagreement.md) — アーキテクチャ詳細
- [docs/operation-playbook.md](operation-playbook.md) — 運用プレイブック
