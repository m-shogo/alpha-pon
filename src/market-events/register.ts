import {
  MARKET_EVENT_SCHEMA_VERSION,
  buildDeliveryId,
  buildEventId,
  buildRevisionId,
  buildSourceId,
  type DeliveryChannel,
  type DeliveryOutboxItem,
  type EventRevision,
  type EventSource,
  type MarketEvent,
  type MarketEventIdentityInput,
} from './contracts.js'
import type { MarketEventLedgerRecord } from './local-ledger.js'

export type RegisterMarketEventInput = {
  identity: MarketEventIdentityInput
  event: Omit<MarketEvent, 'schemaVersion' | 'eventId' | 'createdAt' | 'updatedAt'>
  source: Omit<EventSource, 'schemaVersion' | 'sourceId' | 'eventId'>
  observedAt: string
  publishedAt: string | null
  effectiveAt: string | null
  firstExecutableAt: string | null
  deliveryChannels: DeliveryChannel[]
  deliveryScheduledAt: string
}

/**
 * Creates one deterministic registration bundle. The caller persists the full
 * returned array in order. No partial bundle should be treated as registered.
 */
export function buildInitialRegistration(input: RegisterMarketEventInput): MarketEventLedgerRecord[] {
  const eventId = buildEventId(input.identity)
  const sourceId = buildSourceId({
    authority: input.source.authority,
    url: input.source.url,
    publishedAt: input.source.publishedAt,
    contentHash: input.source.contentHash,
  })

  const event: MarketEvent = {
    ...input.event,
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    eventId,
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
  }

  const revisionFacts = {
    title: event.title,
    status: event.status,
    priority: event.priority,
    time: event.time,
    currentDecisionState: event.currentDecisionState,
    whyItMatters: event.whyItMatters,
  }
  const revisionId = buildRevisionId({
    eventId,
    revisionNumber: 1,
    facts: revisionFacts,
    sourceIds: [sourceId],
  })

  const revision: EventRevision = {
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    revisionId,
    eventId,
    revisionNumber: 1,
    observedAt: input.observedAt,
    publishedAt: input.publishedAt,
    effectiveAt: input.effectiveAt,
    firstExecutableAt: input.firstExecutableAt,
    changeType: 'CREATED',
    facts: revisionFacts,
    sourceIds: [sourceId],
    previousRevisionId: null,
  }

  const source: EventSource = {
    ...input.source,
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    sourceId,
    eventId,
  }

  const deliveries: DeliveryOutboxItem[] = [...new Set(input.deliveryChannels)].map((channel) => ({
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    deliveryId: buildDeliveryId({
      eventId,
      revisionId,
      channel,
      scheduledAt: input.deliveryScheduledAt,
    }),
    eventId,
    revisionId,
    channel,
    state: 'PENDING',
    scheduledAt: input.deliveryScheduledAt,
    attemptCount: 0,
    lastAttemptAt: null,
    deliveredAt: null,
    lastError: null,
  }))

  return [
    { recordType: 'EVENT_SOURCE', recordedAt: input.observedAt, payload: source },
    { recordType: 'EVENT_REVISION', recordedAt: input.observedAt, payload: revision },
    { recordType: 'MARKET_EVENT', recordedAt: input.observedAt, payload: event },
    ...deliveries.map((payload): MarketEventLedgerRecord => ({
      recordType: 'DELIVERY_OUTBOX',
      recordedAt: input.observedAt,
      payload,
    })),
  ]
}
