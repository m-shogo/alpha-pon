import { loadOpsDashboard, type OpsHealthStatus, type OpsSeverity } from '@/lib/ops-dashboard'
import { Disclaimer } from '@/components/Disclaimer'
import styles from './OpsV2.module.css'

export const metadata = { title: '運用ダッシュボード | alpha-pon' }

const HEALTH_META: Record<OpsHealthStatus, { label: string; color: string }> = {
  ok: { label: '通常運用', color: 'var(--mint-deep)' },
  needs_attention: { label: '確認が必要', color: 'var(--amber)' },
  action_required: { label: '対応が必要', color: 'var(--urgent)' },
}

const SEVERITY_META: Record<OpsSeverity, { label: string; color: string }> = {
  urgent: { label: '緊急', color: 'var(--urgent)' },
  attention: { label: '確認', color: 'var(--amber)' },
  info: { label: '情報', color: 'var(--ink-3)' },
}

const QUALITY_CHECK_LABELS: Array<[string, string]> = [
  ['reviewMissing', '未レビュー仮説'],
  ['horizonGaps', '検証期間の記録欠け'],
  ['judgedWithLimitedData', 'データ不足のまま判定'],
  ['unknownMatchedAsHit', '方向不明同士を一致判定'],
  ['pendingWithSignals', '一致材料ありで未評価'],
  ['emptyReviewNotes', '反省メモ未記入'],
  ['dueAtMismatch', 'レビュー期限の不一致'],
]

const RESULT_LABELS: Record<string, string> = {
  hit: '仮説と整合',
  miss: '想定差分あり',
  inverse: '想定と逆行',
  unclear: '判定不能',
  too_early: '時期尚早',
  insufficient_data: 'データ不足',
  unknown: '未確定',
}

function statusLabel(value: string | null | undefined) {
  if (!value) return '未生成'
  if (value === 'ok') return '正常'
  if (value === 'needs_attention') return '確認が必要'
  if (value === 'action_required') return '対応が必要'
  return value
}

function TechnicalRow({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={styles.technicalRow}>
      <span className={styles.technicalKey}>{label}</span>
      <strong style={{ color: warn ? 'var(--amber)' : 'var(--ink)' }}>{value}</strong>
    </div>
  )
}

export default function OpsPage() {
  const data = loadOpsDashboard()

  if (!data) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Alpha Pon の安全運用</div>
          <h1 className={styles.title}>運用状況</h1>
          <p className={styles.subtitle}>運用データを読み込めないため、現在の状態を安全に表示できません。</p>
        </header>
        <div className={styles.empty}>運用サマリーが利用できる状態になったら、ここに対応事項・期限・データ品質を表示します。</div>
        <div className={styles.footer}><Disclaimer /></div>
      </main>
    )
  }

  const health = HEALTH_META[data.healthStatus]
  const oa = data.outcomeAudit
  const overdueReviews = oa.reviewDue?.overdue ?? 0
  const dataIssueCount = data.dataAvailabilityAudit.nonOkCodes.length
  const pipelineIssueCount = data.pipelineAudit.failedSteps.length + data.uiDataAudit.metaWarnings.length
  const worldImpactIssueCount = data.worldImpactAudit.available
    ? data.worldImpactAudit.overdueReviews + data.worldImpactAudit.inconsistencies + data.worldImpactAudit.duplicateKeys + data.worldImpactAudit.jsonlParseErrors
    : 0

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Alpha Pon の安全運用</div>
        <h1 className={styles.title}>運用状況</h1>
        <p className={styles.subtitle}>今日対応すべきこと、レビュー期限、データ品質を先に確認し、監査の内部値は必要なときだけ開きます。</p>
      </header>

      <section className={styles.health}>
        <div>
          <div className={styles.healthLabel}>現在の運用状態</div>
          <div className={styles.healthValue} style={{ color: health.color }}>{health.label}</div>
          <div className={styles.healthMeta}>生成 {data.generatedAt} ・ この画面は運用監査であり、投資助言や注文判断ではありません。</div>
        </div>
        <div>
          <div className={styles.healthLabel}>今日の優先対応</div>
          <div className={styles.healthValue}>{data.priorityIssues.length}件</div>
          <div className={styles.healthMeta}>{data.priorityIssues.length === 0 ? 'すぐに対応が必要な項目はありません。' : '重要度順に下へ表示しています。'}</div>
        </div>
      </section>

      <section className={styles.summary} aria-label="運用サマリー">
        {[
          ['優先対応', `${data.priorityIssues.length}件`, data.priorityIssues.length > 0 ? 'var(--urgent)' : 'var(--mint-deep)'],
          ['レビュー期限超過', `${overdueReviews}件`, overdueReviews > 0 ? 'var(--amber)' : 'var(--mint-deep)'],
          ['データ不足銘柄', `${dataIssueCount}件`, dataIssueCount > 0 ? 'var(--amber)' : 'var(--mint-deep)'],
          ['生成・処理の警告', `${pipelineIssueCount}件`, pipelineIssueCount > 0 ? 'var(--urgent)' : 'var(--mint-deep)'],
        ].map(([label, value, color]) => (
          <div key={label} className={styles.metric}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={styles.metricValue} style={{ color }}>{value}</div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>今日対応すること</h2>
        <p className={styles.sectionIntro}>運用監査が見つけた問題を、重要度の高い順に表示します。</p>
        {data.priorityIssues.length === 0 ? (
          <div className={styles.rowList}><div className={styles.rowBody} style={{ padding: '16px 0' }}>対応が必要な項目はありません。</div></div>
        ) : (
          <div className={styles.issueList}>
            {data.priorityIssues.map((issue, index) => {
              const sev = SEVERITY_META[issue.severity] ?? SEVERITY_META.info
              return (
                <div key={`${issue.category}-${index}`} className={styles.issueRow}>
                  <span className={styles.rank}>{issue.rank ?? index + 1}</span>
                  <div>
                    <div className={styles.rowTitle}>{issue.title}</div>
                    <div className={styles.rowBody}>{issue.detail}</div>
                    {issue.command && <code className={styles.command}>{issue.command}</code>}
                  </div>
                  <span className={styles.severity} style={{ color: sev.color }}>{sev.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>仮説レビューの期限</h2>
        <p className={styles.sectionIntro}>答え合わせが止まっていないかを確認します。0件は異常ではありません。</p>
        <div className={styles.statusGrid}>
          <div className={styles.statusRow}><span className={styles.statusKey}>Outcome総数</span><strong>{oa.total}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>未評価</span><strong>{oa.unevaluated}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>期限超過</span><strong style={{ color: overdueReviews > 0 ? 'var(--amber)' : 'var(--ink)' }}>{overdueReviews}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>本日期限</span><strong>{oa.reviewDue?.dueToday ?? 0}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>今週期限</span><strong>{oa.reviewDue?.dueThisWeek ?? 0}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>価格データ待ち</span><strong>{oa.reviewDue?.priceDataPending ?? 0}件</strong></div>
        </div>
        {oa.judgedWithLimitedData.length > 0 && (
          <div className={styles.notice}>データ不足のまま判定済み: {oa.judgedWithLimitedData.map(item => `${item.code}（${item.horizon}）`).join('、')}</div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>データと検証の品質</h2>
        <p className={styles.sectionIntro}>通常利用で見るべき品質上の問題だけを要約します。</p>
        <div className={styles.statusGrid}>
          <div className={styles.statusRow}><span className={styles.statusKey}>データ不足・部分データ</span><strong>{dataIssueCount}銘柄</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>世界ニュース検証の期限超過</span><strong>{data.worldImpactAudit.overdueReviews}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>世界ニュース検証の不整合</span><strong>{worldImpactIssueCount}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>安全表現の違反</span><strong>{data.safeWordingAudit.violations.length}件</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>公開出力の確認対象</span><strong>{data.safeOutputAudit?.available ? `${data.safeOutputAudit.findingsCount}件` : '未監査'}</strong></div>
          <div className={styles.statusRow}><span className={styles.statusKey}>特殊状況ウォッチ</span><strong>{statusLabel(data.specialSituationAudit.healthStatus)}</strong></div>
        </div>
        {data.dataAvailabilityAudit.nonOkCodes.length > 0 && <div className={styles.notice}>データ確認対象: {data.dataAvailabilityAudit.nonOkCodes.join('、')}</div>}
        {data.worldImpactAudit.priorityIssues.length > 0 && (
          <div className={styles.notice}>世界ニュース側の確認ポイント: {data.worldImpactAudit.priorityIssues.slice(0, 3).map(issue => issue.title ?? issue.detail ?? '確認対象').join(' / ')}</div>
        )}
        <div className={styles.rowMeta}><a className={styles.link} href="/world-impact">世界ニュース影響仮説の詳細を見る →</a></div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>技術監査の詳細</h2>
        <p className={styles.sectionIntro}>普段は開かなくてよい内部監査値・処理状態・安全コマンドです。</p>
        <details className={styles.details}>
          <summary><span>内部監査値を表示</span><span>{data.allIssues.length}件の監査Issue</span></summary>
          <div className={styles.detailsBody}>
            <div className={styles.technicalGroup}>
              <h3 className={styles.technicalTitle}>Outcomeとレビュー品質</h3>
              {Object.entries(oa.resultCounts).map(([result, count]) => <TechnicalRow key={result} label={`結果: ${RESULT_LABELS[result] ?? result}`} value={`${count}件`} />)}
              <TechnicalRow label="Historical seedの期限超過" value={`${oa.reviewDue?.historicalSeedOverdue ?? 0}件`} />
              {oa.integrity && (
                <>
                  <TechnicalRow label="Outcome整合性" value={oa.integrity.status} warn={oa.integrity.status !== 'ok'} />
                  <TechnicalRow label="JSONL重複グループ" value={oa.integrity.jsonlDuplicateGroups} warn={oa.integrity.jsonlDuplicateGroups > 0} />
                  <TechnicalRow label="SQLite重複グループ" value={oa.integrity.sqliteDuplicateGroups} warn={oa.integrity.sqliteDuplicateGroups > 0} />
                  <TechnicalRow label="JSON解析エラー" value={oa.integrity.parseErrors} warn={oa.integrity.parseErrors > 0} />
                </>
              )}
              <TechnicalRow label="品質監査" value={data.outcomeQualityAudit.available ? statusLabel(data.outcomeQualityAudit.healthStatus) : '未生成'} />
              {QUALITY_CHECK_LABELS.map(([key, label]) => {
                const count = data.outcomeQualityAudit.checkCounts[key] ?? 0
                return <TechnicalRow key={key} label={label} value={`${count}件`} warn={count > 0} />
              })}
            </div>

            <div className={styles.technicalGroup}>
              <h3 className={styles.technicalTitle}>世界ニュース影響監査</h3>
              <TechnicalRow label="監査状態" value={data.worldImpactAudit.available ? statusLabel(data.worldImpactAudit.healthStatus) : '未生成'} />
              <TechnicalRow label="影響仮説レビュー" value={`${data.worldImpactAudit.totalReviews}件`} />
              <TechnicalRow label="未評価" value={`${data.worldImpactAudit.pendingReviews}件`} warn={data.worldImpactAudit.pendingReviews > 0} />
              <TechnicalRow label="価格データ待ち" value={`${data.worldImpactAudit.priceDataPending}件`} />
              <TechnicalRow label="価格データ不足" value={`${data.worldImpactAudit.dataUnavailable}件`} warn={data.worldImpactAudit.dataUnavailable > 0} />
              <TechnicalRow label="反証条件未記録" value={`${data.worldImpactAudit.missingCounterArguments}件`} warn={data.worldImpactAudit.missingCounterArguments > 0} />
              <TechnicalRow label="影響メカニズム未記録" value={`${data.worldImpactAudit.missingMechanisms}件`} warn={data.worldImpactAudit.missingMechanisms > 0} />
              <TechnicalRow label="情報源品質不明" value={`${data.worldImpactAudit.sourceQualityUnknown}件`} warn={data.worldImpactAudit.sourceQualityUnknown > 0} />
              <TechnicalRow label="方向不明同士の一致判定" value={`${data.worldImpactAudit.unknownMatchedAsHit}件`} warn={data.worldImpactAudit.unknownMatchedAsHit > 0} />
              <TechnicalRow label="データ不足判定" value={`${data.worldImpactAudit.insufficientData}件`} />
              <TechnicalRow label="確信度未設定" value={`${data.worldImpactAudit.confidenceMissing}件`} warn={data.worldImpactAudit.confidenceMissing > 0} />
              <TechnicalRow label="メカニズム分類不明" value={`${data.worldImpactAudit.mechanismUnknown}件`} warn={data.worldImpactAudit.mechanismUnknown > 0} />
              <TechnicalRow label="反証条件未設定" value={`${data.worldImpactAudit.falsificationMissing}件`} warn={data.worldImpactAudit.falsificationMissing > 0} />
              <TechnicalRow label="重複キー" value={`${data.worldImpactAudit.duplicateKeys}件`} warn={data.worldImpactAudit.duplicateKeys > 0} />
              <TechnicalRow label="JSONL破損行" value={`${data.worldImpactAudit.jsonlParseErrors}件`} warn={data.worldImpactAudit.jsonlParseErrors > 0} />
              <TechnicalRow label="latestとの不一致" value={`${data.worldImpactAudit.latestMismatch}件`} warn={data.worldImpactAudit.latestMismatch > 0} />
              <TechnicalRow label="期限超過でOutcomeなし" value={`${data.worldImpactAudit.dueWithoutOutcome}件`} warn={data.worldImpactAudit.dueWithoutOutcome > 0} />
              <TechnicalRow label="評価データ不整合" value={`${data.worldImpactAudit.inconsistencies}件`} warn={data.worldImpactAudit.inconsistencies > 0} />
            </div>

            <div className={styles.technicalGroup}>
              <h3 className={styles.technicalTitle}>生成・データ安全性</h3>
              {Object.entries(data.dataAvailabilityAudit.qualityLevelCounts).map(([level, count]) => <TechnicalRow key={level} label={`品質 ${level}`} value={`${count}銘柄`} />)}
              <TechnicalRow label="Universe fallback" value={data.staleFallbackAudit.universeFallbackReason ?? 'なし'} warn={Boolean(data.staleFallbackAudit.universeFallbackReason)} />
              <TechnicalRow label="重複warningコード" value={data.staleFallbackAudit.duplicatedWarningCodes.length} warn={data.staleFallbackAudit.duplicatedWarningCodes.length > 0} />
              <TechnicalRow label="Pipeline" value={`${data.pipelineAudit.status ?? '不明'}（${data.pipelineAudit.date ?? '日付不明'}${data.pipelineAudit.isToday ? ' / 本日分' : ''}）`} warn={data.pipelineAudit.failedSteps.length > 0} />
              <TechnicalRow label="Pipeline失敗ステップ" value={data.pipelineAudit.failedSteps.join(', ') || 'なし'} warn={data.pipelineAudit.failedSteps.length > 0} />
              <TechnicalRow label="UI生成データ" value={`${data.uiDataAudit.generatedAt ?? '未生成'}${data.uiDataAudit.isToday ? '（本日分）' : '（要更新）'}`} warn={!data.uiDataAudit.isToday} />
              <TechnicalRow label="UIメタ警告" value={data.uiDataAudit.metaWarnings.join(' / ') || 'なし'} warn={data.uiDataAudit.metaWarnings.length > 0} />
              <TechnicalRow label="安全表現チェック" value={data.safeWordingAudit.violations.length === 0 ? `違反なし（${data.safeWordingAudit.scannedFiles}ファイル）` : `違反 ${data.safeWordingAudit.violations.length}件`} warn={data.safeWordingAudit.violations.length > 0} />
              <TechnicalRow label="公開出力監査" value={!data.safeOutputAudit?.available ? '未生成' : data.safeOutputAudit.findingsCount === 0 ? `検出なし（${data.safeOutputAudit.scannedFiles}ファイル）` : `確認対象 ${data.safeOutputAudit.findingsCount}件`} warn={!data.safeOutputAudit?.available || data.safeOutputAudit.findingsCount > 0} />
            </div>

            <div className={styles.technicalGroup}>
              <h3 className={styles.technicalTitle}>次の安全コマンド</h3>
              {data.nextSafeCommands.length === 0 ? <div className={styles.rowBody}>追加コマンドはありません。</div> : (
                <div className={styles.commandList}>
                  {data.nextSafeCommands.map((cmd, index) => (
                    <div key={`${cmd.command}-${index}`} className={styles.commandBlock}>
                      <code className={styles.command}>{cmd.command}</code>
                      <span className={styles.commandReason}>{cmd.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.notes.length > 0 && (
              <div className={styles.technicalGroup}>
                <h3 className={styles.technicalTitle}>運用メモ</h3>
                <ul className={styles.notes}>{data.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
              </div>
            )}
          </div>
        </details>
      </section>

      <div className={styles.footer}><Disclaimer /></div>
    </main>
  )
}
