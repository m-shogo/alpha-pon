import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeGeneratedLegendProDecisionsInput } from '@/lib/generated-legend-pro-input'
import { Disclaimer } from '@/components/Disclaimer'
import styles from './RoadmapV2.module.css'

export const metadata = { title: '完成ロードマップ | alpha-pon' }

const STATUS_META: Record<string, { label: string; color: string }> = {
  done: { label: '完了', color: 'var(--mint-deep)' },
  partial: { label: '進行中', color: 'var(--sky-deep)' },
  blocked: { label: '要対応', color: 'var(--amber)' },
  not_started: { label: '未着手', color: 'var(--ink-3)' },
}

const HEALTH_LABELS: Record<string, string> = {
  ok: '通常運用',
  needs_attention: '確認が必要',
  action_required: '対応が必要',
  done: '完了',
  partial: '進行中',
  blocked: '要対応',
  not_started: '未着手',
}

const ROADMAP = [
  { phase: '1', itemId: 'real-data', title: '実データ運用', goal: 'J-Quants 実データで daily:full を数日連続で通す' },
  { phase: '2', itemId: 'hypothesis-outcomes', title: '検証履歴の蓄積', goal: '1w/1m/3m・TOPIX比・最大下落を outcome に貯める' },
  { phase: '3', itemId: 'primary-disclosures', title: '一次情報強化', goal: 'TDnet / EDINET の危険開示を個別銘柄判断へ強く接続する' },
  { phase: '4', itemId: 'company-memory', title: '銘柄メモ運用', goal: 'company memory の weakRules / recentOutcomes を毎朝確認する' },
  { phase: '5', itemId: 'portfolio-mode', title: 'ポートフォリオ仕上げ', goal: 'README・スクショ・デモデータ・portfolio mode の見せ方を整える' },
]

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.not_started
}

function healthLabel(value: string | undefined) {
  if (!value) return '未生成'
  return HEALTH_LABELS[value] ?? value
}

function scoreColor(score: number) {
  return score >= 85 ? 'var(--mint-deep)' : score >= 45 ? 'var(--sky-deep)' : 'var(--amber)'
}

function cursorRange(cursor: { offset?: number; maxPerRun?: number; total?: number }) {
  const offset = cursor.offset ?? 0
  const max = cursor.maxPerRun ?? 0
  const total = cursor.total ?? 0
  if (total <= 0) return '範囲未確定'
  return `${offset + 1}-${Math.min(total, offset + Math.max(1, max))} / ${total}`
}

export default function RoadmapPage() {
  const data = loadGeneratedData()
  const readiness = data.readiness
  const readinessById = new Map((readiness?.items ?? []).map(item => [item.id, item]))
  const runCursors = Object.entries(data.runCursors ?? {})
  const specialOps = data.specialSituationOps
  const integrity = data.hypothesisOutcomeIntegrity
  const proDecisions = normalizeGeneratedLegendProDecisionsInput(data.legendProCommittee)
  const outcomes = data.hypothesisOutcomes ?? []
  const disagreementsCount = proDecisions.filter(decision => (decision.disagreements ?? []).length > 0).length
  const missingEvidenceCount = proDecisions.reduce((sum, decision) => sum + (decision.missingEvidence ?? []).length, 0)
  const finalLabelCounts = proDecisions.reduce<Record<string, number>>((acc, decision) => {
    const label = decision.finalLabel ?? '未分類'
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
  const duplicateWarnings = (integrity?.jsonl.duplicateGroups.length ?? 0) + (integrity?.sqlite.duplicateGroups.length ?? 0)
  const actionRequiredCount = specialOps?.actionItems.filter(item => item.priority === 'urgent').length ?? 0
  const overdueCount = specialOps?.reviewDue.overdue ?? 0
  const nextCommands = [
    specialOps?.actionItems.find(item => item.priority === 'urgent' && item.command)?.command,
    duplicateWarnings > 0 ? 'pnpm outcomes:integrity' : null,
    !data.legendProCommittee ? 'pnpm ui:data' : null,
  ].filter((command): command is string => Boolean(command))

  const overallScore = readiness?.overallScore ?? 0
  const overallStatus = readiness?.overallStatus ?? 'not_started'
  const overallMeta = statusMeta(overallStatus)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Alpha Pon の完成状況</div>
        <h1 className={styles.title}>完成ロードマップ</h1>
        <p className={styles.subtitle}>
          どこまで使える状態になっているか、何がまだ足りないか、次に何を進めるかを一画面で確認します。
        </p>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.heroLabel}>総合完成度</div>
          <div className={styles.heroScore}>{readiness ? `${Math.round(overallScore)}%` : '—'}</div>
          <div className={styles.heroStatus} style={{ color: overallMeta.color }}>
            {readiness ? overallMeta.label : '監査データ未生成'}
          </div>
          {readiness && (
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, overallScore))}%`, background: scoreColor(overallScore) }} />
            </div>
          )}
        </div>
        <div>
          <div className={styles.heroLabel}>いま止めているもの</div>
          <div className={styles.blockers}>
            {readiness?.blockers.length ? readiness.blockers.slice(0, 4).map((blocker, index) => (
              <div key={`${blocker}-${index}`} className={styles.blocker}>{blocker}</div>
            )) : <div className={styles.blocker}>大きなブロッカーはありません。</div>}
          </div>
        </div>
      </section>

      <section className={styles.summary} aria-label="現在の注意事項">
        {[
          ['すぐ対応', `${actionRequiredCount}件`, actionRequiredCount > 0 ? 'var(--urgent)' : 'var(--mint-deep)'],
          ['期限超過', `${overdueCount}件`, overdueCount > 0 ? 'var(--amber)' : 'var(--mint-deep)'],
          ['不足証拠', `${missingEvidenceCount}件`, missingEvidenceCount > 0 ? 'var(--amber)' : 'var(--mint-deep)'],
          ['重複警告', `${duplicateWarnings}件`, duplicateWarnings > 0 ? 'var(--urgent)' : 'var(--mint-deep)'],
        ].map(([label, value, color]) => (
          <div key={label} className={styles.metric}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={styles.metricValue} style={{ color }}>{value}</div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>残りロードマップ</h2>
        <p className={styles.sectionIntro}>完成までの5段階を、実際の監査結果と紐づけて表示します。</p>
        <div className={styles.roadmapList}>
          {ROADMAP.map(item => {
            const audit = readinessById.get(item.itemId)
            const status = audit?.status ?? 'not_started'
            const meta = statusMeta(status)
            const score = audit?.score ?? 0
            return (
              <div key={item.phase} className={styles.roadmapRow}>
                <span className={styles.phase}>{item.phase}</span>
                <div>
                  <div className={styles.rowTitle}>{item.title}</div>
                  <div className={styles.rowBody}>{item.goal}</div>
                  <div className={styles.progress}>
                    <div className={styles.progressFill} style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: scoreColor(score) }} />
                  </div>
                  <div className={styles.rowMeta}>
                    現在 {audit ? `${Math.round(score)}%` : '未監査'} ・ 次 {audit?.nextActions[0] ?? '継続確認'}
                  </div>
                </div>
                <span className={styles.status} style={{ color: meta.color }}>{meta.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      {readiness && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>自動監査で分かっていること</h2>
          <p className={styles.sectionIntro}>各項目の証拠と次のアクションを、カードではなく一覧で比較します。</p>
          <div className={styles.auditList}>
            {readiness.items.map(item => {
              const meta = statusMeta(item.status)
              return (
                <div key={item.id} className={styles.auditRow}>
                  <span className={styles.phase}>✓</span>
                  <div>
                    <div className={styles.rowTitle}>{item.label}</div>
                    <div className={styles.rowBody}>{item.evidence.slice(0, 2).join(' / ') || '証拠未記録'}</div>
                    <div className={styles.rowMeta}>次 {item.nextActions[0] ?? '継続確認'} ・ {Math.round(item.score)}%</div>
                  </div>
                  <span className={styles.status} style={{ color: meta.color }}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>運用の詳細</h2>
        <p className={styles.sectionIntro}>普段は見なくてよい技術状態・処理位置・コマンドをここにまとめています。</p>
        <details className={styles.details}>
          <summary><span>技術状態と次回処理範囲</span><span>{healthLabel(specialOps?.healthStatus ?? readiness?.overallStatus)}</span></summary>
          <div className={styles.detailsBody}>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}><span className={styles.detailKey}>運用状態</span><strong>{healthLabel(specialOps?.healthStatus)}</strong></div>
              <div className={styles.detailItem}><span className={styles.detailKey}>生成データ</span><strong>{data.generatedAt ?? '未生成'}</strong></div>
              <div className={styles.detailItem}><span className={styles.detailKey}>Outcome一意性</span><strong>{integrity?.sqlite.uniqueIndexExists ? '確認済み' : '未確認'}</strong></div>
              <div className={styles.detailItem}><span className={styles.detailKey}>Pro判断</span><strong>{proDecisions.length}件</strong></div>
              <div className={styles.detailItem}><span className={styles.detailKey}>意見相違あり</span><strong>{disagreementsCount}件</strong></div>
              <div className={styles.detailItem}><span className={styles.detailKey}>Outcome</span><strong>{outcomes.length}件</strong></div>
            </div>

            {Object.keys(finalLabelCounts).length > 0 && (
              <div className={styles.rowMeta}>最終ラベル分布: {Object.entries(finalLabelCounts).map(([label, count]) => `${label} ${count}`).join(' / ')}</div>
            )}

            {runCursors.length > 0 && (
              <div className={styles.cursorList}>
                {runCursors.map(([key, cursor]) => (
                  <div key={key} className={styles.cursorRow}>
                    <span className={styles.phase}>→</span>
                    <div>
                      <div className={styles.rowTitle}>{cursor.jobName ?? key}</div>
                      <div className={styles.rowMeta}>次 {cursorRange(cursor)} ・ 更新 {cursor.updatedAt ?? '未記録'}</div>
                    </div>
                    <span className={styles.status}>offset {cursor.offset ?? 0}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.commandList}>
              {nextCommands.length > 0 ? nextCommands.slice(0, 3).map(command => <code key={command} className={styles.command}>{command}</code>) : (
                <div className={styles.okText}>追加対応コマンドはありません。通常のヘルスチェックで継続確認します。</div>
              )}
            </div>
          </div>
        </details>
      </section>

      <div className={styles.footer}><Disclaimer compact /></div>
    </main>
  )
}
