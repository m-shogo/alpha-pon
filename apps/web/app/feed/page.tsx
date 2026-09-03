import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import styles from './feed.module.css'

export const metadata = { title: '通知履歴 | alpha-pon' }

function levelLabel(level: string) {
  if (level === 'urgent') return '重要'
  if (level === 'daily') return '日次'
  if (level === 'log') return '記録'
  if (level === 'ignore') return '対象外'
  return level
}

export default function FeedPage() {
  const data = loadGeneratedData()
  const feedItems = data.candidates
    .filter(candidate => candidate.lastNotifiedAt)
    .map(candidate => ({
      code: candidate.code,
      name: candidate.name,
      total: calcTotal(candidate.score),
      level: calcLevel(calcTotal(candidate.score)),
      reason: candidate.triggeredRule || '通知理由の記録なし',
      lastNotifiedAt: candidate.lastNotifiedAt!,
    }))
    .sort((a, b) => b.total - a.total)

  const byDate: Record<string, typeof feedItems> = {}
  for (const item of feedItems) {
    const date = item.lastNotifiedAt.split(' ')[0] ?? item.lastNotifiedAt
    ;(byDate[date] = byDate[date] ?? []).push(item)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  const importantCount = feedItems.filter(item => item.level === 'urgent').length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>重要な変化だけ振り返る</p>
        <h1 className={styles.title}>通知履歴</h1>
        <p className={styles.lead}>
          過去に通知対象になった銘柄と、その理由を日付順で確認します。通知履歴は買い推奨の記録ではありません。
        </p>
      </header>

      <section className={styles.summary} aria-label="通知履歴の概要">
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>通知履歴</div>
          <div className={styles.summaryValue}>{feedItems.length}件</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>重要レベル</div>
          <div className={styles.summaryValue} style={{ color: importantCount > 0 ? 'var(--urgent)' : 'var(--ink)' }}>
            {importantCount}件
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>最新通知日</div>
          <div className={styles.summaryValue}>{dates[0] ?? 'なし'}</div>
        </div>
      </section>

      <div className={styles.content}>
        {dates.length === 0 ? (
          <div className={styles.empty}>
            現在、表示できる通知履歴はありません。意味のある通知が発生したときだけ、ここに履歴が追加されます。
          </div>
        ) : (
          dates.map(date => (
            <section key={date} className={styles.dayGroup}>
              <div className={styles.dayHead}>
                <h2 className={styles.dayTitle}>{date}</h2>
                <div className={styles.dayCount}>{byDate[date].length}件</div>
              </div>
              <div className={styles.list}>
                {byDate[date].map(item => {
                  const alert = ALERT_META[item.level]
                  return (
                    <Link key={`${date}-${item.code}`} href={`/stocks/${item.code}`} className={styles.row}>
                      <span className={styles.levelBar} style={{ background: alert.colorVar }} aria-hidden="true" />
                      <div className={styles.identity}>
                        <div className={styles.nameLine}>
                          <span className={styles.name}>{item.name}</span>
                          <span className={styles.code}>{item.code}</span>
                        </div>
                        <div className={styles.reason}>{item.reason}</div>
                        <div className={styles.meta}>判定スコア {item.total} ・ 通知 {item.lastNotifiedAt}</div>
                      </div>
                      <div className={styles.level} style={{ color: alert.colorVar }}>
                        {levelLabel(item.level)}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))
        )}
        <div className={styles.footerSpace} />
      </div>
    </main>
  )
}
