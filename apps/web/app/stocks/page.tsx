import { getGeneratedData } from '@/lib/generated-data'
import { StockList } from '@/components/StockList'
import { DataStatus } from '@/components/DataStatus'
import { Disclaimer } from '@/components/Disclaimer'
import styles from './StocksPage.module.css'

export default async function StocksPage() {
  const data = await getGeneratedData()

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>銘柄</h1>
          <p className={styles.subtitle}>
            監視中の銘柄を調査優先スコア順に比較します。価格・騰落率・主要指標は取得できた値だけを表示し、未取得は推測しません。
          </p>
        </div>
      </header>

      <DataStatus generatedAt={data.generatedAt} stocks={data.stocks} />

      {(data.meta?.warnings?.length ?? 0) > 0 && (
        <section className={styles.warningBlock} aria-label="銘柄データの注意事項">
          <strong>データ確認が必要です</strong>
          <ul>
            {data.meta?.warnings?.map((warning, index) => (
              <li key={`${index}-${warning.slice(0, 24)}`}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>監視中の銘柄</h2>
        <span className={styles.sectionMeta}>{data.stocks.length}銘柄 · 調査優先順</span>
      </div>

      <StockList stocks={data.stocks} />

      <p className={styles.scoreNote}>調査優先スコアは「次に詳しく見る順番」を整理するための値で、買い推奨度ではありません。</p>
      <Disclaimer />
    </main>
  )
}
