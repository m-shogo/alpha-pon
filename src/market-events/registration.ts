import {
  MARKET_EVENT_SCHEMA_VERSION,
  buildDecisionSnapshotId,
  buildDeliveryId,
  buildEventId,
  buildRevisionId,
  buildSourceId,
  validateMarketEventBundle,
  type ConfidenceState,
  type DecisionState,
  type DeliveryChannel,
  type EventChangeType,
  type EventSourceType,
  type EventTime,
  type MarketEventBundle,
  type MarketEventPriority,
  type MarketEventStatus,
  type MarketEventType,
  type StorageClass,
} from "./contracts.js";

export type MarketEventSourceInput = {
  authority: string;
  sourceType: EventSourceType;
  url: string;
  title: string;
  publishedAt: string | null;
  retrievedAt: string;
  contentHash: string;
  storageClass: StorageClass;
  objectKey?: string | null;
};

export type MarketEventDeliveryInput = {
  channel: DeliveryChannel;
  deliveryKey: string;
  scheduledAt: string;
  payload?: Record<string, unknown>;
};

export type MarketEventRegistrationInput = {
  issuerCode: string | null;
  issuerName: string;
  eventType: MarketEventType;
  occurrenceKey: string;
  title: string;
  status: MarketEventStatus;
  priority: MarketEventPriority;
  time: EventTime;
  edgeTypes?: string[];
  currentDecisionState?: DecisionState;
  whyItMatters: string;
  checksBefore?: string[];
  checksAfter?: string[];
  relatedEventIds?: string[];
  lastVerifiedAt?: string;
  staleAfter?: string | null;
  observedAt: string;
  publishedAt?: string | null;
  effectiveAt?: string | null;
  firstExecutableAt?: string | null;
  changeType: EventChangeType;
  facts?: Record<string, unknown>;
  sources: MarketEventSourceInput[];
  decision?: {
    confidenceState: ConfidenceState;
    reasons: string[];
    invalidationConditions?: string[];
  } | null;
  deliveries?: MarketEventDeliveryInput[];
};

export type MarketEventRegistrationContext = {
  revisionNumber: number;
  previousRevisionId: string | null;
  existingCreatedAt: string | null;
};

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(value => value.trim()).filter(Boolean))];
}

function validateRegistrationInput(input: MarketEventRegistrationInput): void {
  if (!input.issuerName.trim()) throw new Error("issuerName is required");
  if (!input.occurrenceKey.trim()) throw new Error("occurrenceKey is required");
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.whyItMatters.trim()) throw new Error("whyItMatters is required");
  if (input.time.precision === "UNKNOWN" && input.status !== "UNKNOWN_DATE" && input.status !== "TENTATIVE") {
    throw new Error("UNKNOWN time requires UNKNOWN_DATE or TENTATIVE status");
  }
  if (input.time.precision !== "UNKNOWN" && input.status === "UNKNOWN_DATE") {
    throw new Error("UNKNOWN_DATE status requires UNKNOWN time precision");
  }
  if (input.eventType !== "REVIEW_CHECKPOINT" && input.sources.length === 0) {
    throw new Error("Non-review events require at least one source");
  }
  if (input.sources.some(source => !source.contentHash.trim())) {
    throw new Error("Every source requires a contentHash");
  }
}

export function buildMarketEventBundle(
  input: MarketEventRegistrationInput,
  context: MarketEventRegistrationContext,
): MarketEventBundle {
  validateRegistrationInput(input);
  if (!Number.isInteger(context.revisionNumber) || context.revisionNumber < 1) {
    throw new Error("revisionNumber must be a positive integer");
  }

  const eventId = buildEventId(input);
  const decisionState = input.currentDecisionState ?? "INFO";
  const sources = input.sources.map(source => ({
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    sourceId: buildSourceId(source),
    eventId,
    authority: source.authority.trim(),
    sourceType: source.sourceType,
    url: source.url,
    title: source.title.trim(),
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
    contentHash: source.contentHash.trim().toLowerCase(),
    storageClass: source.storageClass,
    objectKey: source.objectKey ?? null,
  }));

  const revisionFacts: Record<string, unknown> = {
    status: input.status,
    priority: input.priority,
    time: input.time,
    currentDecisionState: decisionState,
    whyItMatters: input.whyItMatters,
    ...(input.facts ?? {}),
  };
  const revisionId = buildRevisionId({
    eventId,
    revisionNumber: context.revisionNumber,
    facts: revisionFacts,
    sourceIds: sources.map(source => source.sourceId),
  });
  const createdAt = context.existingCreatedAt ?? input.observedAt;
  const event = {
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    eventId,
    occurrenceKey: input.occurrenceKey.trim(),
    issuerCode: input.issuerCode?.trim() || null,
    issuerName: input.issuerName.trim(),
    eventType: input.eventType,
    title: input.title.trim(),
    status: input.status,
    priority: input.priority,
    time: input.time,
    edgeTypes: uniqueStrings(input.edgeTypes),
    currentDecisionState: decisionState,
    whyItMatters: input.whyItMatters.trim(),
    checksBefore: uniqueStrings(input.checksBefore),
    checksAfter: uniqueStrings(input.checksAfter),
    relatedEventIds: uniqueStrings(input.relatedEventIds),
    lastVerifiedAt: input.lastVerifiedAt ?? input.observedAt,
    staleAfter: input.staleAfter ?? null,
    createdAt,
    updatedAt: input.observedAt,
  } as const;
  const revision = {
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    revisionId,
    eventId,
    revisionNumber: context.revisionNumber,
    observedAt: input.observedAt,
    publishedAt: input.publishedAt ?? null,
    effectiveAt: input.effectiveAt ?? null,
    firstExecutableAt: input.firstExecutableAt ?? null,
    changeType: input.changeType,
    facts: revisionFacts,
    sourceIds: sources.map(source => source.sourceId),
    previousRevisionId: context.previousRevisionId,
  } as const;
  const decisionSnapshot = input.decision
    ? {
        schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
        decisionSnapshotId: buildDecisionSnapshotId({
          eventId,
          revisionId,
          decisionState,
          confidenceState: input.decision.confidenceState,
          createdAt: input.observedAt,
        }),
        eventId,
        revisionId,
        decisionState,
        confidenceState: input.decision.confidenceState,
        reasons: uniqueStrings(input.decision.reasons),
        invalidationConditions: uniqueStrings(input.decision.invalidationConditions),
        createdAt: input.observedAt,
      } as const
    : null;
  const deliveries = (input.deliveries ?? []).map(delivery => ({
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    deliveryId: buildDeliveryId({
      eventId,
      revisionId,
      channel: delivery.channel,
      deliveryKey: delivery.deliveryKey,
      scheduledAt: delivery.scheduledAt,
    }),
    deliveryKey: delivery.deliveryKey.trim(),
    eventId,
    revisionId,
    channel: delivery.channel,
    state: "PENDING" as const,
    payload: delivery.payload ?? {
      eventId,
      title: event.title,
      priority: event.priority,
      decisionState,
    },
    scheduledAt: delivery.scheduledAt,
    attemptCount: 0,
    lastAttemptAt: null,
    deliveredAt: null,
    lastError: null,
    leaseExpiresAt: null,
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
  }));

  const bundle: MarketEventBundle = { event, revision, sources, decisionSnapshot, deliveries };
  validateMarketEventBundle(bundle);
  return bundle;
}
