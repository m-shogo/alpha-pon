type OwnerResearchSummaryReferenceProjection = {
  overview: {
    readiness: {
      promotionReadyEdgeIds: readonly string[]
      holdoutReadyEdgeIds: readonly string[]
    }
  }
  researchItems?: readonly {
    id: string
    families: readonly { id: string }[]
    questions: readonly { id: string }[]
  }[]
  formalEdges: readonly { id: string }[]
}

function hasUniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length
}

function hasUniqueKnownEdgeIds(ids: readonly string[], knownEdgeIds: ReadonlySet<string>): boolean {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!knownEdgeIds.has(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

export function isOwnerResearchSummaryReferenceSafe(
  value: OwnerResearchSummaryReferenceProjection,
): boolean {
  if (value.researchItems !== undefined) {
    if (!hasUniqueIds(value.researchItems)) return false
    if (value.researchItems.some((item) => !hasUniqueIds(item.families) || !hasUniqueIds(item.questions))) return false
  }

  const formalEdgeIds = value.formalEdges.map((edge) => edge.id)
  const knownEdgeIds = new Set(formalEdgeIds)
  if (knownEdgeIds.size !== formalEdgeIds.length) return false

  return hasUniqueKnownEdgeIds(value.overview.readiness.promotionReadyEdgeIds, knownEdgeIds)
    && hasUniqueKnownEdgeIds(value.overview.readiness.holdoutReadyEdgeIds, knownEdgeIds)
}
