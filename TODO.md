# alpha-pon TODO

**このファイルは現行の正本ではありません。**

→ [docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md](docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md)

## 人間しかできない作業（2026-09-10 時点）

| # | 内容 | 状態 |
|---|------|------|
| 1 | **J-Quants の認証復旧** | **未解決・最優先**。`.env` の `JQUANTS_API_KEY` で `/v2/listed/info` が HTTP 403（応答0.23秒なのでネットワークではなくキー側）。キー再発行か `JQUANTS_EMAIL`/`JQUANTS_PASSWORD` の設定が必要。これが解けるまで実データでの Edge 検証に進めない |
| 2 | GitHub の「Automatically delete head branches」を有効化 | 未対応。squash merge でマージ済みブランチが remote に残り続けている |
| 3 | `config/company-network.yml` に親子・子会社をコード付きで追加 | 未対応。read-across の C2（キオクシア系）がこれ待ち |
| 4 | Market Event の schedule 有効化承認 | 未対応。Issue #1777 の Safety により明示承認なしには行わない |

旧 TODO.md にあった A〜H の機能追加は、正本ロードマップの Edge カタログ（A〜F）と
実装ロードマップ（Phase 0〜6）へ引き継いだ。
