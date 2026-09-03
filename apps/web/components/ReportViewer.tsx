'use client'

import { useState } from 'react'
import type { GeneratedReport } from '@/lib/types'
import styles from './ReportViewer.module.css'

type Props = {
  reports: GeneratedReport[]
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let i = 0

  const inline = (value: string): React.ReactNode => {
    const parts = value.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, index) =>
      part.startsWith('**')
        ? <strong key={index}>{part.slice(2, -2)}</strong>
        : part
    )
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      out.push(<h1 key={i} className={styles.mdH1}>{line.slice(2)}</h1>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      out.push(<h2 key={i} className={styles.mdH2}>{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('> ')) {
      out.push(<div key={i} className={styles.quote}>{inline(line.slice(2))}</div>)
      i++; continue
    }
    if (line.startsWith('---')) {
      out.push(<hr key={i} className={styles.rule} />)
      i++; continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2)); i++
      }
      out.push(
        <ul key={i} className={styles.list}>
          {items.map((item, index) => (
            <li key={index} className={styles.listItem}>
              <span className={styles.bullet}>•</span><span>{inline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
      const cells = rows
        .filter(row => !/^\|[\s|:-]+\|$/.test(row))
        .map(row => row.split('|').slice(1, -1).map(cell => cell.trim()))
      out.push(
        <div key={i} className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {cells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    if (line.trim() === '') { i++; continue }
    out.push(<p key={i} className={styles.paragraph}>{inline(line)}</p>)
    i++
  }

  return out
}

export function ReportViewer({ reports }: Props) {
  const available = reports.filter(report => report.available)
  const [selectedKey, setSelectedKey] = useState<string>(available[0]?.key ?? '')
  const [raw, setRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const selected = reports.find(report => report.key === selectedKey)
  const content = selected?.fullContent ?? selected?.excerpt?.join('\n') ?? ''

  const copy = () => {
    try { navigator.clipboard.writeText(content) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className={styles.viewer}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>生成レポート</h2>
        <span className={styles.count}>{available.length} / {reports.length}件利用可能</span>
      </div>

      <div className={styles.reportList}>
        {reports.map(report => (
          <button
            key={report.key}
            type="button"
            disabled={!report.available}
            aria-current={selectedKey === report.key ? 'true' : undefined}
            className={styles.reportButton}
            onClick={() => {
              if (!report.available) return
              setSelectedKey(report.key)
              setRaw(false)
            }}
          >
            <span>
              <span className={styles.reportLabel}>{report.label}</span>
              <span className={styles.reportPath}>{report.path}</span>
            </span>
            <span className={styles.reportState}>{report.available ? '生成済み' : '未生成'}</span>
          </button>
        ))}
      </div>

      {selected && content && (
        <div className={styles.contentSection}>
          <div className={styles.headingRow}>
            <h2 className={styles.heading}>{selected.label}</h2>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.tabs}>
              <button type="button" className={`${styles.tab} ${!raw ? styles.tabActive : ''}`} onClick={() => setRaw(false)}>読みやすく表示</button>
              <button type="button" className={`${styles.tab} ${raw ? styles.tabActive : ''}`} onClick={() => setRaw(true)}>元のMarkdown</button>
            </div>
            <button type="button" className={styles.copy} onClick={copy}>
              {copied ? 'コピーしました' : 'Markdownをコピー'}
            </button>
          </div>

          {raw
            ? <pre className={styles.raw}>{content}</pre>
            : <div className={styles.content}>{renderMarkdown(content)}</div>
          }

          <p className={styles.note}>必要に応じて完成ロードマップやデータ状態も確認してから深掘りします。</p>
        </div>
      )}
    </section>
  )
}
