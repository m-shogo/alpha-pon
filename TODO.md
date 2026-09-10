# alpha-pon TODO

**このファイルは現行の正本ではありません。**

→ [docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md](docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md)

## 人間しかできない作業（2026-09-11 時点）

**重要な訂正**: 2026-09-10 に「J-Quants の認証が切れており最優先の人間作業」と報告しましたが、
これは誤りでした。認証は生きています。診断は次で確認できます。

```bash
node --env-file=.env --import tsx/esm scripts/diagnose-jquants.ts --execute
```


| # | 内容 | 状態 |
|---|------|------|
| 1 | ~~J-Quants の認証復旧~~ | **2026-09-11 訂正: 認証は生きていた。**以前「403 = キー無効」と報告したのは誤りで、存在しないパス `/v2/listed/info` を叩いてgeneric 403 を受けていただけだった。`/v2/equities/bars/daily` は HTTP 200 で実データを返す（契約範囲 2024-06-19〜2026-06-19）。**人間の作業は不要**。実際の制約はバースト枠のレート制限で、`src/fetcher/adaptive-rate-limit.ts` で対応済み |
| 2 | GitHub の「Automatically delete head branches」を有効化 | 未対応。squash merge でマージ済みブランチが remote に残り続けている |
| 3 | `config/company-network.yml` に親子・子会社をコード付きで追加 | 未対応。read-across の C2（キオクシア系）がこれ待ち |
| 4 | Market Event の schedule 有効化承認 | 未対応。Issue #1777 の Safety により明示承認なしには行わない |

旧 TODO.md にあった A〜H の機能追加は、正本ロードマップの Edge カタログ（A〜F）と
実装ロードマップ（Phase 0〜6）へ引き継いだ。
