const OWNER_GATE_KEYS = new Set([
  'sufficientSamples',
  'holdoutPass',
  'pitSafe',
  'netAlphaPositive',
  'executionFeasible',
  'liquiditySufficient',
  'borrowCostCovered',
  'confoundersRemoved',
  'counterfactualExplained',
  'decayChecked',
  'falseDiscoveryGuard',
])

const OWNER_GATE_COUNT = OWNER_GATE_KEYS.size

type OwnerGateProjection = {
  formalEdges: readonly {
    gate: { pass: number; fail: number; unknown: number; total: number }
    verificationGaps: readonly { key: string; state: string }[]
  }[]
}

export function isOwnerResearchSummaryGateSafe(value: OwnerGateProjection): boolean {
  return value.formalEdges.every((edge) => {
    if (edge.gate.total !== OWNER_GATE_COUNT) return false
    if (edge.gate.pass + edge.gate.fail + edge.gate.unknown !== OWNER_GATE_COUNT) return false

    const gapKeys = new Set<string>()
    let fail = 0
    let unknown = 0
    for (const gap of edge.verificationGaps) {
      if (!OWNER_GATE_KEYS.has(gap.key) || gapKeys.has(gap.key)) return false
      if (gap.state === 'fail') fail += 1
      else if (gap.state === 'unknown') unknown += 1
      else return false
      gapKeys.add(gap.key)
    }

    return fail === edge.gate.fail
      && unknown === edge.gate.unknown
      && edge.verificationGaps.length === edge.gate.fail + edge.gate.unknown
  })
}
