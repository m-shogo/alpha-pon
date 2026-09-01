type OwnerResearchSummaryReferenceProjection = {
  overview: {
    readiness: {
      promotionReadyEdgeIds: readonly string[]
      holdoutReadyEdgeIds: readonly string[]
    }
  }
  formalEdges: readonly { id: string }[]
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
  const formalEdgeIds = value.formalEdges.map((edge) => edge.id)
  const knownEdgeIds = new Set(formalEdgeIds)
  if (knownEdgeIds.size !== formalEdgeIds.length) return false

  return hasUniqueKnownEdgeIds(value.overview.readiness.promotionReadyEdgeIds, knownEdgeIds)
    && hasUniqueKnownEdgeIds(value.overview.readiness.holdoutReadyEdgeIds, knownEdgeIds)
}
