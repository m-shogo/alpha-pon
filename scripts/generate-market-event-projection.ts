import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildLatestEventProjection, readLedger } from '../src/market-events/local-ledger.js'
import { buildIcsCalendar, buildWebProjection } from '../src/market-events/projection.js'

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  return value || fallback
}

const ledgerPath = resolve(readArg('ledger', 'data/market_events.jsonl'))
const jsonPath = resolve(readArg('json', 'apps/web/public/generated/alpha-pon-events.json'))
const icsPath = resolve(readArg('ics', 'apps/web/public/generated/alpha-pon-events.ics'))
const detailBaseUrl = process.env.ALPHA_PON_PUBLIC_URL || undefined
const generatedAt = new Date().toISOString()

const result = readLedger(ledgerPath)
if (result.parseErrors.length > 0) {
  for (const error of result.parseErrors) {
    console.error(`[market-events] parse error line ${error.lineNumber}: ${error.message}`)
  }
  process.exitCode = 1
  throw new Error('Market event ledger contains invalid records; projection not generated')
}

const events = [...buildLatestEventProjection(result.records).values()]
const projection = buildWebProjection({ events, generatedAt, source: 'local-ledger' })
const calendar = buildIcsCalendar({ events, generatedAt, detailBaseUrl })

for (const path of [jsonPath, icsPath]) mkdirSync(dirname(path), { recursive: true })
writeFileSync(jsonPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
writeFileSync(icsPath, calendar, 'utf8')

console.log(JSON.stringify({
  status: 'ok',
  ledgerPath,
  jsonPath,
  icsPath,
  totalEvents: projection.counts.total,
  generatedAt,
}, null, 2))
