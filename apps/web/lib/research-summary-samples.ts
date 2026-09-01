type OwnerSummarySampleProjection = {
  overview: {
    recent7d: {
      currentFormalSamples: number
    }
  }
  formalEdges: Array<{
    samples: {
      current: number
    }
  }>
}

export function isOwnerResearchSummarySampleSafe(value: OwnerSummarySampleProjection): boolean {
  const projectedCurrent = value.formalEdges.reduce((sum, edge) => sum + edge.samples.current, 0)
  return value.overview.recent7d.currentFormalSamples === projectedCurrent
}
