import {
  computeOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "./outcome-learning-proposal.js";
import {
  computeOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionRecord,
} from "./outcome-learning-decision.js";
import {
  computeOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationRecord,
} from "./outcome-learning-shadow-evaluation.js";
import {
  computeOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionRecord,
} from "./outcome-learning-adoption-decision.js";
import {
  computeOutcomeLearningChangePreparationHash,
  type OutcomeLearningChangePreparationRecord,
} from "./outcome-learning-change-preparation.js";

export type OutcomeLearningNextAction =
  | "review_provisional_ai_proposal"
  | "make_learning_decision"
  | "revisit_learning_decision"
  | "run_shadow_evaluation"
  | "continue_shadow_evaluation"
  | "make_adoption_decision"
  | "revisit_adoption_decision"
  | "create_change_preparation_draft"
  | "finalize_change_preparation"
  | "prepare_pull_request_for_human_review"
  | "none";

export type OutcomeLearningStatus = {
  rootProposalId: string;
  currentProposalId: string;
  currentProposalContentHash: string;
  targetKind: OutcomeLearningProposalRecord["targetKind"];
  targetRef: string;
  proposedChange: string;
  proposalStage: OutcomeLearningProposalRecord["proposalStage"];
  learningDecisionId?: string;
  learningDecision?: OutcomeLearningDecisionRecord["decision"];
  shadowEvaluationId?: string;
  shadowStage?: OutcomeLearningShadowEvaluationRecord["evaluationStage"];
  shadowVerdict?: OutcomeLearningShadowEvaluationRecord["verdict"];
  adoptionDecisionId?: string;
  adoptionDecision?: OutcomeLearningAdoptionDecisionRecord["decision"];
  changePreparationId?: string;
  changePreparationStage?: OutcomeLearningChangePreparationRecord["preparationStage"];
  nextAction: OutcomeLearningNextAction;
  requiresHumanAction: boolean;
  terminal: boolean;
  terminalReason?: "proposal_rejected" | "learning_rejected" | "adoption_rejected";
  staleDownstreamRecordIds: string[];
};

export type OutcomeLearningStatusContext = {
  proposals: readonly OutcomeLearningProposalRecord[];
  validatedProposalHashes: ReadonlySet<string>;
  decisions: readonly OutcomeLearningDecisionRecord[];
  validatedDecisionHashes: ReadonlySet<string>;
  shadowEvaluations: readonly OutcomeLearningShadowEvaluationRecord[];
  validatedShadowEvaluationHashes: ReadonlySet<string>;
  adoptionDecisions: readonly OutcomeLearningAdoptionDecisionRecord[];
  validatedAdoptionDecisionHashes: ReadonlySet<string>;
  changePreparations: readonly OutcomeLearningChangePreparationRecord[];
  validatedChangePreparationHashes: ReadonlySet<string>;
};

type LinearRecord = Record<string, unknown>;

type Chain<T> = {
  root: T;
  latest: T;
  records: T[];
};

function assertValidated<T extends LinearRecord>(input: {
  records: readonly T[];
  idField: keyof T;
  hashField: keyof T;
  witnesses: ReadonlySet<string>;
  computeHash: (record: T) => string;
  label: string;
}): void {
  const ids = new Set<string>();
  for (const record of input.records) {
    const id = record[input.idField];
    const hash = record[input.hashField];
    if (typeof id !== "string" || !id) throw new Error(`${input.label}: invalid record id`);
    if (typeof hash !== "string" || !hash) throw new Error(`${input.label}:${id}: invalid contentHash`);
    if (ids.has(id)) throw new Error(`${input.label}: duplicate id: ${id}`);
    ids.add(id);
    if (input.computeHash(record) !== hash) throw new Error(`${input.label}:${id}: contentHash mismatch`);
    if (!input.witnesses.has(hash)) throw new Error(`${input.label}:${id}: validated hash witness missing`);
  }
}

function linearChains<T extends LinearRecord>(input: {
  records: readonly T[];
  idField: keyof T;
  parentField: keyof T;
  label: string;
}): Chain<T>[] {
  const byId = new Map<string, T>();
  const children = new Map<string, string[]>();
  const roots: T[] = [];

  for (const record of input.records) {
    const id = record[input.idField];
    if (typeof id !== "string" || !id) throw new Error(`${input.label}: invalid id`);
    byId.set(id, record);
  }

  for (const record of input.records) {
    const id = record[input.idField] as string;
    const parent = record[input.parentField];
    if (parent === undefined) {
      roots.push(record);
      continue;
    }
    if (typeof parent !== "string" || !parent) throw new Error(`${input.label}:${id}: invalid parent id`);
    if (!byId.has(parent)) throw new Error(`${input.label}:${id}: missing parent ${parent}`);
    const list = children.get(parent) ?? [];
    list.push(id);
    children.set(parent, list);
  }

  for (const [parent, list] of children) {
    if (list.length > 1) throw new Error(`${input.label}:${parent}: revision fork: ${list.sort().join(",")}`);
  }

  const visited = new Set<string>();
  const chains: Chain<T>[] = [];
  for (const root of roots) {
    const records: T[] = [];
    let current = root;
    while (true) {
      const id = current[input.idField] as string;
      if (visited.has(id)) throw new Error(`${input.label}:${id}: cycle or shared revision detected`);
      visited.add(id);
      records.push(current);
      const childId = children.get(id)?.[0];
      if (!childId) break;
      current = byId.get(childId)!;
    }
    chains.push({ root, latest: records.at(-1)!, records });
  }

  if (visited.size !== input.records.length) {
    const unresolved = [...byId.keys()].filter((id) => !visited.has(id));
    throw new Error(`${input.label}: unresolved/cyclic records: ${unresolved.sort().join(",")}`);
  }
  return chains;
}

function oneChainPerKey<T>(chains: readonly Chain<T>[], key: (root: T) => string, label: string): Map<string, Chain<T>> {
  const map = new Map<string, Chain<T>>();
  for (const chain of chains) {
    const value = key(chain.root);
    if (map.has(value)) throw new Error(`${label}: duplicate root chain for ${value}`);
    map.set(value, chain);
  }
  return map;
}

export function deriveOutcomeLearningStatuses(context: OutcomeLearningStatusContext): OutcomeLearningStatus[] {
  assertValidated({
    records: context.proposals,
    idField: "proposalId",
    hashField: "contentHash",
    witnesses: context.validatedProposalHashes,
    computeHash: (record) => computeOutcomeLearningProposalHash(record as OutcomeLearningProposalRecord),
    label: "learning-proposal",
  });
  assertValidated({
    records: context.decisions,
    idField: "decisionId",
    hashField: "contentHash",
    witnesses: context.validatedDecisionHashes,
    computeHash: (record) => computeOutcomeLearningDecisionHash(record as OutcomeLearningDecisionRecord),
    label: "learning-decision",
  });
  assertValidated({
    records: context.shadowEvaluations,
    idField: "evaluationId",
    hashField: "contentHash",
    witnesses: context.validatedShadowEvaluationHashes,
    computeHash: (record) => computeOutcomeLearningShadowEvaluationHash(record as OutcomeLearningShadowEvaluationRecord),
    label: "shadow-evaluation",
  });
  assertValidated({
    records: context.adoptionDecisions,
    idField: "adoptionDecisionId",
    hashField: "contentHash",
    witnesses: context.validatedAdoptionDecisionHashes,
    computeHash: (record) => computeOutcomeLearningAdoptionDecisionHash(record as OutcomeLearningAdoptionDecisionRecord),
    label: "adoption-decision",
  });
  assertValidated({
    records: context.changePreparations,
    idField: "manifestId",
    hashField: "contentHash",
    witnesses: context.validatedChangePreparationHashes,
    computeHash: (record) => computeOutcomeLearningChangePreparationHash(record as OutcomeLearningChangePreparationRecord),
    label: "change-preparation",
  });

  const proposalChains = linearChains({
    records: context.proposals,
    idField: "proposalId",
    parentField: "supersedesProposalId",
    label: "learning-proposal",
  });
  const decisionChains = oneChainPerKey(
    linearChains({
      records: context.decisions,
      idField: "decisionId",
      parentField: "supersedesDecisionId",
      label: "learning-decision",
    }),
    (root) => root.proposalId,
    "learning-decision",
  );
  const shadowChains = oneChainPerKey(
    linearChains({
      records: context.shadowEvaluations,
      idField: "evaluationId",
      parentField: "supersedesEvaluationId",
      label: "shadow-evaluation",
    }),
    (root) => root.decisionId,
    "shadow-evaluation",
  );
  const adoptionChains = oneChainPerKey(
    linearChains({
      records: context.adoptionDecisions,
      idField: "adoptionDecisionId",
      parentField: "supersedesAdoptionDecisionId",
      label: "adoption-decision",
    }),
    (root) => root.shadowEvaluationId,
    "adoption-decision",
  );
  const preparationChains = oneChainPerKey(
    linearChains({
      records: context.changePreparations,
      idField: "manifestId",
      parentField: "supersedesManifestId",
      label: "change-preparation",
    }),
    (root) => root.adoptionDecisionId,
    "change-preparation",
  );

  const statuses: OutcomeLearningStatus[] = [];
  for (const proposalChain of proposalChains) {
    const proposal = proposalChain.latest;
    const staleDownstreamRecordIds: string[] = [];
    for (const historical of proposalChain.records.slice(0, -1)) {
      const staleDecision = decisionChains.get(historical.proposalId);
      if (staleDecision) staleDownstreamRecordIds.push(...staleDecision.records.map((record) => record.decisionId));
    }

    const base: Omit<OutcomeLearningStatus, "nextAction" | "requiresHumanAction" | "terminal"> = {
      rootProposalId: proposalChain.root.proposalId,
      currentProposalId: proposal.proposalId,
      currentProposalContentHash: proposal.contentHash,
      targetKind: proposal.targetKind,
      targetRef: proposal.targetRef,
      proposedChange: proposal.proposedChange,
      proposalStage: proposal.proposalStage,
      staleDownstreamRecordIds: staleDownstreamRecordIds.sort(),
    };

    if (proposal.proposalStage === "rejected") {
      statuses.push({ ...base, nextAction: "none", requiresHumanAction: false, terminal: true, terminalReason: "proposal_rejected" });
      continue;
    }

    const decisionChain = decisionChains.get(proposal.proposalId);
    if (!decisionChain) {
      statuses.push({
        ...base,
        nextAction: proposal.proposalStage === "draft_proposal" ? "review_provisional_ai_proposal" : "make_learning_decision",
        requiresHumanAction: true,
        terminal: false,
      });
      continue;
    }

    const decision = decisionChain.latest;
    const withDecision = {
      ...base,
      learningDecisionId: decision.decisionId,
      learningDecision: decision.decision,
    };
    if (decision.decision === "reject") {
      statuses.push({ ...withDecision, nextAction: "none", requiresHumanAction: false, terminal: true, terminalReason: "learning_rejected" });
      continue;
    }
    if (decision.decision === "defer") {
      statuses.push({ ...withDecision, nextAction: "revisit_learning_decision", requiresHumanAction: true, terminal: false });
      continue;
    }

    const shadowChain = shadowChains.get(decision.decisionId);
    if (!shadowChain) {
      statuses.push({ ...withDecision, nextAction: "run_shadow_evaluation", requiresHumanAction: false, terminal: false });
      continue;
    }
    const shadow = shadowChain.latest;
    const withShadow = {
      ...withDecision,
      shadowEvaluationId: shadow.evaluationId,
      shadowStage: shadow.evaluationStage,
      shadowVerdict: shadow.verdict,
    };
    if (shadow.evaluationStage === "interim") {
      statuses.push({ ...withShadow, nextAction: "continue_shadow_evaluation", requiresHumanAction: false, terminal: false });
      continue;
    }

    const adoptionChain = adoptionChains.get(shadow.evaluationId);
    if (!adoptionChain) {
      statuses.push({ ...withShadow, nextAction: "make_adoption_decision", requiresHumanAction: true, terminal: false });
      continue;
    }
    const adoption = adoptionChain.latest;
    const withAdoption = {
      ...withShadow,
      adoptionDecisionId: adoption.adoptionDecisionId,
      adoptionDecision: adoption.decision,
    };
    if (adoption.decision === "reject") {
      statuses.push({ ...withAdoption, nextAction: "none", requiresHumanAction: false, terminal: true, terminalReason: "adoption_rejected" });
      continue;
    }
    if (adoption.decision === "defer") {
      statuses.push({ ...withAdoption, nextAction: "revisit_adoption_decision", requiresHumanAction: true, terminal: false });
      continue;
    }

    const preparationChain = preparationChains.get(adoption.adoptionDecisionId);
    if (!preparationChain) {
      statuses.push({ ...withAdoption, nextAction: "create_change_preparation_draft", requiresHumanAction: false, terminal: false });
      continue;
    }
    const preparation = preparationChain.latest;
    const withPreparation = {
      ...withAdoption,
      changePreparationId: preparation.manifestId,
      changePreparationStage: preparation.preparationStage,
    };
    if (preparation.preparationStage === "draft") {
      statuses.push({ ...withPreparation, nextAction: "finalize_change_preparation", requiresHumanAction: false, terminal: false });
      continue;
    }
    statuses.push({
      ...withPreparation,
      nextAction: "prepare_pull_request_for_human_review",
      requiresHumanAction: false,
      terminal: false,
    });
  }

  return statuses.sort((left, right) => {
    if (left.requiresHumanAction !== right.requiresHumanAction) return left.requiresHumanAction ? -1 : 1;
    return `${left.nextAction}|${left.rootProposalId}`.localeCompare(`${right.nextAction}|${right.rootProposalId}`);
  });
}

export type OutcomeLearningStatusSummary = {
  total: number;
  requiresHumanAction: number;
  terminal: number;
  byNextAction: Record<OutcomeLearningNextAction, number>;
};

export function summarizeOutcomeLearningStatuses(statuses: readonly OutcomeLearningStatus[]): OutcomeLearningStatusSummary {
  const byNextAction: Record<OutcomeLearningNextAction, number> = {
    review_provisional_ai_proposal: 0,
    make_learning_decision: 0,
    revisit_learning_decision: 0,
    run_shadow_evaluation: 0,
    continue_shadow_evaluation: 0,
    make_adoption_decision: 0,
    revisit_adoption_decision: 0,
    create_change_preparation_draft: 0,
    finalize_change_preparation: 0,
    prepare_pull_request_for_human_review: 0,
    none: 0,
  };
  for (const status of statuses) byNextAction[status.nextAction] += 1;
  return {
    total: statuses.length,
    requiresHumanAction: statuses.filter((status) => status.requiresHumanAction).length,
    terminal: statuses.filter((status) => status.terminal).length,
    byNextAction,
  };
}
