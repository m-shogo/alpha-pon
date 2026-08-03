import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appendLedgerRecord, readLedger } from '../src/market-events/local-ledger.js'
import { buildInitialRegistration, type RegisterMarketEventInput } from '../src/market-events/register.js'

function arg(name: string): string | null {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null
}

const inputPath = arg('input')
const ledgerPath = resolve(arg('ledger') ?? 'data/market_events.jsonl')
const write = process.argv.includes('--write')

if (!inputPath) throw new Error('Usage: register-market-event --input=event.json [--ledger=path] [--write]')
const absoluteInput = resolve(inputPath)
if (!existsSync(absoluteInput)) throw new Error(`Input file not found: ${absoluteInput}`)

const input = JSON.parse(readFileSync(absoluteInput, 'utf8')) as RegisterMarketEventInput
const bundle = buildInitialRegistration(input)
const existing = readLedger(ledgerPath)
if (existing.parseErrors.length > 0) {
  throw new Error(`Refusing to append to corrupted ledger: ${existing.parseErrors.length} parse error(s)`)
}

const existingKeys = new Set(existing.records.map((record) => {
  switch (record.recordType) {
    case 'MARKET_EVENT': return `event:${record.payload.eventId}:${record.payload.updatedAt}`
    case 'EVENT_REVISION': return `revision:${record.payload.revisionId}`
    case 'EVENT_SOURCE': return `source:${record.payload.sourceId}`
    case 'DELIVERY_OUTBOX': return `delivery:${record.payload.deliveryId}`
  }
}))
const candidates = bundle.filter((record) => {
  switch (record.recordType) {
    case 'MARKET_EVENT': return !existingKeys.has(`event:${record.payload.eventId}:${record.payload.updatedAt}`)
    case 'EVENT_REVISION': return !existingKeys.has(`revision:${record.payload.revisionId}`)
    case 'EVENT_SOURCE': return !existingKeys.has(`source:${record.payload.sourceId}`)
    case 'DELIVERY_OUTBOX': return !existingKeys.has(`delivery:${record.payload.deliveryId}`)
  }
})

const summary = {
  mode: write ? 'write' : 'dry-run',
  ledgerPath,
  eventId: bundle.find((record) => record.recordType === 'MARKET_EVENT')?.payload.eventId,
  generatedRecords: bundle.length,
  newRecords: candidates.length,
  duplicateRecords: bundle.length - candidates.length,
  recordTypes: candidates.map((record) => record.recordType),
}

if (write) {
  for (const record of candidates) appendLedgerRecord(ledgerPath, record)
}

console.log(JSON.stringify(summary, null, 2))
