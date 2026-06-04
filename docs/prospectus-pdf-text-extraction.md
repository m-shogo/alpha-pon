# 目論見書PDFテキスト抽出ガイド

## 目的

目論見書PDFからロックアップ条件を確認するため、PDF本文をテキスト化して `data/prospectus_text.txt` に置く。

これは買い推奨ではなく、ロックアップ解除条件を検証するための補助作業。

## 推奨手順 macOS

`pdftotext` を使う場合は poppler を入れる。

```bash
brew install poppler
```

PDFを配置する。

```bash
mkdir -p data
cp /path/to/prospectus.pdf data/prospectus.pdf
```

テキスト化する。

```bash
pdftotext -layout data/prospectus.pdf data/prospectus_text.txt
```

ロックアップ候補を抽出する。

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts
```

候補を `data/lockup_memos.jsonl` に追記する場合だけ `--write`。

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts --write
```

その後、ロックアップイベント化する。

```bash
node --import tsx/esm src/extract-lockup-events.ts
```

反映する場合だけ `--write`。

```bash
node --import tsx/esm src/extract-lockup-events.ts --write
```

## 注意

- PDFからの抽出は完全ではない
- 数字の読み間違い、表の崩れ、注記漏れが起きる
- `180日` / `90日` / `解除条件` / `発行価格の1.5倍` などは必ず目論見書原文で確認する
- 抽出結果は候補であり、確定情報ではない
- 上場日・解除日・解除条件は手動確認後に `data/lockup_memos.jsonl` へ入れる

## 見るべき語句

```text
ロックアップ
継続所有
売却等
解除
180日
90日
発行価格の1.5倍
主幹事会社の同意
```

## 中学生向け説明

PDFはそのままだとプログラムが読みづらい。
だから、まず文章だけのテキストファイルに変える。
そのあと、ロックアップという言葉の近くを探して、売れるようになる日を見つける。
