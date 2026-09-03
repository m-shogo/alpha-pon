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
          <div className={styles.eyebrow}>監視銘柄</div>
          <h1 className={styles.title}>銘柄一覧</h1>
          <p className={styles.subtitle}>
            スコアの高い順に、価格・騰落率・主要指標を比較します。価格を取得できていない項目は推測せず「未取得」と表示します。
          </p>
        </div>
      </header>

      <DataStatus generatedAt={data.generatedAt} stocks={data.stocks} />

      {(data.meta?.warnings?.length ?? 0) > 0 && (
        <ul className={styles.warningList}>
          {data.meta?.warnings?.map((warning, index) => (
            <li key={`${index}-${warning.slice(0, 24)}`}>⚠ {warning}</li>
          ))}
        </ul>
      )}

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>比較する</h2>
        <span className={styles.sectionMeta}>{data.stocks.length}銘柄 · スコア順</span>
      </div>

      <StockList stocks={data.stocks} />

      <Disclaimer />
    </main>
  )
}
