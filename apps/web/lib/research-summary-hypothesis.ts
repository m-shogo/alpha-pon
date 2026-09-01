type OwnerSummaryHypothesisProjection = {
  formalEdges: Array<{
    hypothesis: string
    hypothesisPreview: string
  }>
}

function canonicalHypothesisPreview(text: string): string {
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text.trim()]
  const preview = parts.slice(0, 2).join('')
  return preview.length <= 260 ? preview : `${preview.slice(0, 259)}…`
}

export function isOwnerResearchSummaryHypothesisSafe(value: OwnerSummaryHypothesisProjection): boolean {
  return value.formalEdges.every((edge) => edge.hypothesisPreview === canonicalHypothesisPreview(edge.hypothesis))
}
