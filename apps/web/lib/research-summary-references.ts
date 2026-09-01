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
  const knownEdgeIds = new Set(value.formalEdges.map((edge) => edge.id))
  return hasUniqueKnownEdgeIds(value.overview.readiness.promotionReadyEdgeIds, knownEdgeIds)
    && hasUniqueKnownEdgeIds(value.overview.readiness.holdoutReadyEdgeIds, knownEdgeIds)
}
