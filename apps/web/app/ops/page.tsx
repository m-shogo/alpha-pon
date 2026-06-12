import { loadOpsDashboard, type OpsHealthStatus, type OpsSeverity } from '@/lib/ops-dashboard'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'

export const metadata = { title: '運用ダッシュボード | alpha-pon' }

const HEALTH_META: Record<OpsHealthStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'OK — 通常運用', color: 'var(--mint-deep)', bg: 'var(--mint-soft)' },
  needs_attention: { label: '確認対象あり', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  action_required: { label: '要対応', color: 'var(--urgent)', bg: 'var(--urgent-soft)' },
}

const SEVERITY_META: Record<OpsSeverity, { label: string; color: string }> = {
  urgent: { label: '緊急', color: 'var(--urgent)' },
  attention: { label: '確認', color: 'var(--amber)' },
  info: { label: '情報', color: 'var(--ink-3)' },
}

const QUALITY_CHECK_LABELS: Array<[string, string]> = [
  ['reviewMissing', '未レビュー仮説'],
  ['horizonGaps', 'horizon 記録欠け'],
  ['judgedWithLimitedData', 'データ不足のまま判定'],
  ['unknownMatchedAsHit', 'unknown 同士の hit'],
  ['pendingWithSignals', 'whatMatched ありで未評価'],
  ['emptyReviewNotes', '反省メモ未記入'],
  ['dueAtMismatch', 'reviewDueAt ズレ'],
]

function CountRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{value}</span>
    </div>
  )
}

export default function OpsPage() {
  const data = loadOpsDashboard()

  if (!data) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)', margin: '0 0 12px' }}>
          運用ダッシュボード
        </h1>
        <Card>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            運用データが未生成です。<code>pnpm report:ops</code> を実行すると、
            ここに今日の運用状態（pipeline・仮説レビュー・データ品質・安全表現チェック）が表示されます。
          </p>
        </Card>
        <Disclaimer />
      </div>
    )
  }

  const health = HEALTH_META[data.healthStatus]
  const oa = data.outcomeAudit

  return (
    <div style={{ padding: '20px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px' }}>
        運用ダッシュボード
      </h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
        生成日: {data.generatedAt} ／ 投資助言は行いません
      </p>

      {/* healthStatus */}
      <Card
        style={{
          background: health.bg,
          border: `1px solid ${health.color}`,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name={data.healthStatus === 'ok' ? 'check' : 'alert'} size={22} color={health.color} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>healthStatus</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: health.color }}>
              {data.healthStatus} ／ {health.label}
            </div>
          </div>
        </div>
      </Card>

      {/* 優先対応 */}
      <SectionLabel icon={<Icon name="alert" size={15} color="currentColor" />}>
        優先対応 TOP{Math.max(data.priorityIssues.length, 1)}
      </SectionLabel>
      {data.priorityIssues.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--mint-deep)', fontWeight: 700 }}>
            対応が必要な項目はありません。
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.priorityIssues.map((issue, index) => {
            const sev = SEVERITY_META[issue.severity] ?? SEVERITY_META.info
            return (
              <Card key={`${issue.category}-${index}`}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-3)' }}>
                    {issue.rank ?? index + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: sev.color,
                      border: `1px solid ${sev.color}`,
                      borderRadius: 6,
                      padding: '1px 6px',
                    }}
                  >
                    {sev.label}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{issue.title}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  {issue.detail}
                </p>
                {issue.command && (
                  <code
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'var(--surface-2)',
                      borderRadius: 8,
                      padding: '2px 8px',
                    }}
                  >
                    {issue.command}
                  </code>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* 仮説レビュー */}
      <SectionLabel icon={<Icon name="doc" size={15} color="currentColor" />}>仮説レビュー状況</SectionLabel>
      <Card>
        <CountRow label="outcome 総数" value={`${oa.total}件`} />
        {Object.entries(oa.resultCounts).map(([result, count]) => (
          <CountRow key={result} label={`result: ${result}`} value={`${count}件`} />
        ))}
        {oa.reviewDue && (
          <>
            <CountRow label="採点期限超過" value={`${oa.reviewDue.overdue}件`} />
            <CountRow label="うち historical seed" value={`${oa.reviewDue.historicalSeedOverdue}件`} />
            <CountRow label="うち価格データ提供待ち" value={`${oa.reviewDue.priceDataPending ?? 0}件`} />
            <CountRow label="本日期限" value={`${oa.reviewDue.dueToday}件`} />
            <CountRow label="今週期限" value={`${oa.reviewDue.dueThisWeek}件`} />
          </>
        )}
        {oa.judgedWithLimitedData.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--amber)', fontWeight: 700, lineHeight: 1.6 }}>
            データ不足のまま判定済み（確認対象）:{' '}
            {oa.judgedWithLimitedData.map(item => `${item.code}(${item.horizon})`).join(', ')}
          </p>
        )}
        {oa.integrity && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
            整合性: {oa.integrity.status}（jsonl重複 {oa.integrity.jsonlDuplicateGroups} / sqlite重複{' '}
            {oa.integrity.sqliteDuplicateGroups} / parse_error {oa.integrity.parseErrors}）
          </p>
        )}
      </Card>

      {/* 仮説レビュー品質監査 */}
      <SectionLabel icon={<Icon name="filter" size={15} color="currentColor" />}>仮説レビュー品質監査</SectionLabel>
      <Card>
        {!data.outcomeQualityAudit.available ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>
            未生成です。<code>pnpm audit:outcomes</code> を実行してください。
          </p>
        ) : (
          <>
            <CountRow label="監査結果" value={data.outcomeQualityAudit.healthStatus ?? '不明'} />
            {QUALITY_CHECK_LABELS.map(([key, label]) => {
              const count = data.outcomeQualityAudit.checkCounts[key] ?? 0
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: count > 0 ? 'var(--amber)' : 'var(--ink)', fontWeight: 800 }}>{count}件</span>
                </div>
              )
            })}
          </>
        )}
      </Card>

      {/* 世界ニュース影響仮説 */}
      <SectionLabel icon={<Icon name="arc" size={15} color="currentColor" />}>世界ニュース影響仮説</SectionLabel>
      <Card>
        {!data.worldImpactAudit.available ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>
            未生成です。<code>pnpm review:world-impact</code> と <code>pnpm audit:world-impact</code> を実行してください。
          </p>
        ) : (
          <>
            <CountRow label="監査結果" value={data.worldImpactAudit.healthStatus ?? '不明'} />
            <CountRow label="影響仮説レビュー" value={`${data.worldImpactAudit.totalReviews}件`} />
            <CountRow label="未評価 outcome" value={`${data.worldImpactAudit.pendingReviews}件`} />
            <CountRow label="期限超過の未評価" value={`${data.worldImpactAudit.overdueReviews}件`} />
            <CountRow label="価格データ提供待ち" value={`${data.worldImpactAudit.priceDataPending}件`} />
            <CountRow label="価格データ不足" value={`${data.worldImpactAudit.dataUnavailable}件`} />
            <CountRow label="反証条件未記録" value={`${data.worldImpactAudit.missingCounterArguments}件`} />
            <CountRow label="影響メカニズム未記録" value={`${data.worldImpactAudit.missingMechanisms}件`} />
            <CountRow label="sourceQuality 不明" value={`${data.worldImpactAudit.sourceQualityUnknown}件`} />
            <CountRow label="unknown 同士の hit" value={`${data.worldImpactAudit.unknownMatchedAsHit}件`} />
            <CountRow label="insufficient_data" value={`${data.worldImpactAudit.insufficientData}件`} />
            <CountRow label="confidence 未設定" value={`${data.worldImpactAudit.confidenceMissing}件`} />
            <CountRow label="mechanism 分類 unknown" value={`${data.worldImpactAudit.mechanismUnknown}件`} />
            <CountRow label="反証条件（falsification）未設定" value={`${data.worldImpactAudit.falsificationMissing}件`} />
            <CountRow label="重複 event/銘柄/horizon" value={`${data.worldImpactAudit.duplicateKeys}件`} />
            <CountRow label="JSONL 破損行" value={`${data.worldImpactAudit.jsonlParseErrors}件`} />
            <CountRow label="latest との不一致" value={`${data.worldImpactAudit.latestMismatch}件`} />
            {data.worldImpactAudit.priorityIssues.length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                確認ポイント:{' '}
                {data.worldImpactAudit.priorityIssues
                  .slice(0, 3)
                  .map(issue => issue.title ?? issue.detail ?? '確認対象')
                  .join(' / ')}
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 800 }}>
              <a href="/world-impact" style={{ color: 'var(--mint-deep)' }}>影響仮説の一覧・検証結果を見る →</a>
            </p>
          </>
        )}
      </Card>

      {/* データ品質 / stale fallback */}
      <SectionLabel icon={<Icon name="filter" size={15} color="currentColor" />}>データ品質</SectionLabel>
      <Card>
        {Object.entries(data.dataAvailabilityAudit.qualityLevelCounts).map(([level, count]) => (
          <CountRow key={level} label={`品質 ${level}`} value={`${count}銘柄`} />
        ))}
        {data.dataAvailabilityAudit.nonOkCodes.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            データ不足/部分データ: {data.dataAvailabilityAudit.nonOkCodes.join(', ')}
          </p>
        )}
        {data.staleFallbackAudit.universeFallbackReason && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>
            universe scan fallback: {data.staleFallbackAudit.universeFallbackReason}
          </p>
        )}
        {data.staleFallbackAudit.duplicatedWarningCodes.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>
            warning 重複: {data.staleFallbackAudit.duplicatedWarningCodes.map(d => d.code).join(', ')}
          </p>
        )}
      </Card>

      {/* pipeline / UI data */}
      <SectionLabel icon={<Icon name="arc" size={15} color="currentColor" />}>パイプライン / UIデータ</SectionLabel>
      <Card>
        <CountRow
          label="pipeline"
          value={`${data.pipelineAudit.status ?? '不明'}（${data.pipelineAudit.date ?? '日付不明'}${data.pipelineAudit.isToday ? ' / 本日分' : ''}）`}
        />
        {data.pipelineAudit.failedSteps.length > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--urgent)', fontWeight: 700 }}>
            失敗ステップ: {data.pipelineAudit.failedSteps.join(', ')}
          </p>
        )}
        <CountRow
          label="UI 生成データ"
          value={`${data.uiDataAudit.generatedAt ?? '未生成'}${data.uiDataAudit.isToday ? '（本日分）' : '（要更新）'}`}
        />
        {data.uiDataAudit.metaWarnings.length > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--amber)', fontWeight: 700, lineHeight: 1.6 }}>
            meta warnings: {data.uiDataAudit.metaWarnings.join(' / ')}
          </p>
        )}
        <CountRow
          label="特殊状況ウォッチ"
          value={data.specialSituationAudit.healthStatus ?? '未生成'}
        />
        <CountRow
          label="安全表現チェック"
          value={
            data.safeWordingAudit.violations.length === 0
              ? `違反なし（${data.safeWordingAudit.scannedFiles}ファイル）`
              : `違反 ${data.safeWordingAudit.violations.length}件`
          }
        />
      </Card>

      {/* 次の安全コマンド */}
      <SectionLabel icon={<Icon name="spark" size={15} color="currentColor" />}>次に実行する安全コマンド</SectionLabel>
      <Card>
        {data.nextSafeCommands.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>なし</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.nextSafeCommands.map((cmd, index) => (
              <div key={`${cmd.command}-${index}`}>
                <code
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: 'var(--accent)',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    padding: '2px 8px',
                  }}
                >
                  {cmd.command}
                </code>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>{cmd.reason}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* notes */}
      {data.notes.length > 0 && (
        <>
          <SectionLabel>運用メモ</SectionLabel>
          <Card>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
              {data.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Disclaimer />
    </div>
  )
}
