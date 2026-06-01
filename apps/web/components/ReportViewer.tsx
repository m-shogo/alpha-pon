'use client'

import { useState } from 'react'
import type { GeneratedReport } from '@/lib/types'
import { Card, SectionLabel } from './Card'
import { Icon } from './Icon'

type Props = {
  reports: GeneratedReport[]
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let i = 0

  const inline = (s: string): React.ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, k) =>
      p.startsWith('**')
        ? <strong key={k} style={{ fontWeight: 800, color: 'var(--ink)' }}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('# ')) {
      out.push(<h1 key={i} style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 21, color: 'var(--ink)', margin: '4px 0 10px' }}>{l.slice(2)}</h1>)
      i++; continue
    }
    if (l.startsWith('## ')) {
      out.push(<h2 key={i} style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, color: 'var(--accent)', margin: '18px 0 8px' }}>{l.slice(3)}</h2>)
      i++; continue
    }
    if (l.startsWith('> ')) {
      out.push(<div key={i} style={{ borderLeft: '3px solid var(--accent)', background: 'var(--accent-soft)', padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '8px 0' }}>{inline(l.slice(2))}</div>)
      i++; continue
    }
    if (l.startsWith('---')) {
      out.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '16px 0' }} />)
      i++; continue
    }
    if (l.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++ }
      out.push(
        <ul key={i} style={{ margin: '4px 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, k) => (
            <li key={k} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>
              <span style={{ color: 'var(--accent)' }}>•</span>{inline(it)}
            </li>
          ))}
        </ul>
      )
      continue
    }
    if (l.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
      const cells = rows
        .filter((r) => !/^\|[\s|:-]+\|$/.test(r))
        .map((r) => r.split('|').slice(1, -1).map((c) => c.trim()))
      out.push(
        <table key={i} style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0', fontSize: 13 }}>
          <tbody>
            {cells.map((row, r) => (
              <tr key={r}>
                {row.map((c, ci) => (
                  <td key={ci} style={{ padding: '7px 10px', borderBottom: '1px solid var(--line)', fontWeight: r === 0 ? 800 : 600, color: r === 0 ? 'var(--ink-2)' : 'var(--ink)', textAlign: ci === 0 ? 'left' : 'right' }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }
    if (l.trim() === '') { i++; continue }
    out.push(<p key={i} style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, margin: '6px 0', lineHeight: 1.6 }}>{inline(l)}</p>)
    i++
  }
  return out
}

export function ReportViewer({ reports }: Props) {
  const available = reports.filter((r) => r.available)
  const [selectedKey, setSelectedKey] = useState<string>(available[0]?.key ?? '')
  const [raw, setRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const selected = reports.find((r) => r.key === selectedKey)
  const content = selected?.fullContent ?? selected?.excerpt?.join('\n') ?? ''

  const copy = () => {
    try { navigator.clipboard.writeText(content) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      {/* report list */}
      <SectionLabel icon={<Icon name="doc" size={15} />}>生成レポート一覧</SectionLabel>
      <Card pad={6}>
        {reports.map((r, i) => (
          <div
            key={r.key}
            onClick={() => { setSelectedKey(r.key); setRaw(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderBottom: i < reports.length - 1 ? '1px solid var(--line)' : 'none',
              cursor: r.available ? 'pointer' : 'default',
              background: selectedKey === r.key ? 'var(--accent-soft)' : 'transparent',
              borderRadius: selectedKey === r.key ? 12 : 0,
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 8,
              background: r.available ? 'var(--mint-soft)' : 'var(--surface-2)',
              color: r.available ? 'var(--mint-deep)' : 'var(--ink-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name={r.available ? 'check' : 'alert'} size={13} strokeWidth={2.6} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{r.label}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.path}
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: r.available ? 'var(--mint-deep)' : 'var(--ink-3)',
              background: r.available ? 'var(--mint-soft)' : 'var(--surface-2)',
              borderRadius: 6, padding: '2px 7px',
            }}>
              {r.available ? 'ok' : 'missing'}
            </span>
          </div>
        ))}
      </Card>

      {/* content viewer */}
      {selected && content && (
        <>
          <SectionLabel icon={<Icon name="spark" size={15} />}>{selected.label}</SectionLabel>
          <div style={{
            display: 'flex', gap: 6, background: 'var(--surface-2)', borderRadius: 11, padding: 3, marginBottom: 12,
          }}>
            {(['preview', 'raw'] as const).map((m) => {
              const on = (m === 'raw') === raw
              return (
                <button key={m} onClick={() => setRaw(m === 'raw')} style={{
                  padding: '6px 11px', borderRadius: 8, border: 'none',
                  background: on ? 'var(--surface)' : 'transparent',
                  color: on ? 'var(--ink)' : 'var(--ink-3)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--ui)',
                  cursor: 'pointer', boxShadow: on ? 'var(--shadow)' : 'none',
                }}>
                  {m === 'raw' ? 'Raw' : 'プレビュー'}
                </button>
              )
            })}
          </div>
          <Card pad={raw ? 0 : 18}>
            {raw
              ? <pre style={{ margin: 0, padding: 16, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, lineHeight: 1.7, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</pre>
              : <div>{renderMarkdown(content)}</div>
            }
          </Card>
          <button onClick={copy} style={{
            width: '100%', height: 52, marginTop: 14, borderRadius: 15,
            border: 'none',
            background: copied ? 'var(--mint-deep)' : 'var(--accent)',
            color: '#fff', fontSize: 14.5, fontWeight: 700, fontFamily: 'var(--ui)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer', boxShadow: '0 6px 16px var(--accent-shadow)',
            transition: 'background .2s',
          }}>
            <Icon name={copied ? 'check' : 'copy'} size={18} color="#fff" />
            {copied ? 'コピーしました' : 'Markdownをコピー（AIに貼る）'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, margin: '12px 0 4px', lineHeight: 1.6 }}>
            Pro会議・改善ロードマップ・データ信頼度を見てから深掘りします。
          </p>
        </>
      )}
    </>
  )
}
