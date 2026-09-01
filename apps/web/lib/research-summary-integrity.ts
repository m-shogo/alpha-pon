type OwnerSummaryIntegrityProjection = {
  integrity: {
    status: 'ok' | 'attention'
    issueCount: number
    errorCount: number
    warningCount: number
    knowledgeIssueCount: number
  }
}

export function isOwnerResearchSummaryIntegritySafe(value: OwnerSummaryIntegrityProjection): boolean {
  const integrity = value.integrity
  if (integrity.issueCount !== integrity.errorCount + integrity.warningCount) return false
  if (integrity.knowledgeIssueCount > integrity.errorCount) return false

  const expectedStatus = integrity.issueCount === 0 ? 'ok' : 'attention'
  return integrity.status === expectedStatus
}
