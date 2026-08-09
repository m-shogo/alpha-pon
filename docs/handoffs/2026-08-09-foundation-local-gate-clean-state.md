# Foundation / local real-pilot clean-state handoff — 2026-08-09

## Status

`GITHUB_SAFE_HARDENING_GREEN_REAL_LOCAL_EVIDENCE_PENDING`

This handoff is the current deliberate stop boundary for speculative GitHub-side Foundation hardening. The highest-value next progress is the real local Sanrio/Foundation evidence chain, not another synthetic/governance layer.

The exception remains narrow: resume GitHub-side Foundation hardening only when a concrete reproducible fail-open defect, measured CI/runtime regression, or local real-pilot operability gap is demonstrated.

## Canonical Git state

At this handoff:

- `main` is the source of truth;
- this handoff is based on generated main `5e12d0a0071457f7f3530f6d746d5adaaf33caae` after PR #217;
- normal working PRs are expected to return to zero after this docs PR merges;
- PR #1 remains an intentional long-running research Draft / DO NOT MERGE;
- PR #43 remains a legacy Decision Firewall reference Draft / DO NOT MERGE;
- stale/superseded PRs and old remote branches are reference only and must not be revived merely because they still exist;
- Research OS generated commits may advance `main`; when that happens, rebuild the narrow functional diff from latest generated `main` rather than force/rebase/rewrite a stale branch.

Preferred working pattern:

1. inspect latest `main` and open PRs;
2. keep one normal working PR at a time;
3. Draft checks;
4. Ready;
5. full Check / CI / Research OS as applicable;
6. squash merge with expected head SHA;
7. wait for the normal generated Research OS commit;
8. verify open PRs return to the intentional Draft set only.

## Security Master state

The recent Security Master chain is software/CI green for the concrete defects measured in this cycle:

- historical business-effective revisions are preserved;
- future-observed revisions cannot leak into past PIT snapshots;
- snapshot relationships require both endpoints in the same snapshot;
- repository `asOf` is a real Gregorian date;
- ticker resolution requires market namespace;
- provider-code resolution requires provider namespace;
- the core Security Master test suite is wired into the normal Research OS / Check aggregates.

Do not continue speculative Security Master hardening unless a new reproducible identity/provenance defect is demonstrated.

Real `SECURITY_MASTER_V1_GREEN` is still unproven until local real records resolve the target listed security, issuer and listing at the relevant PIT cutoff.

## PIT Price / J-Quants state

Software hardening is green for the current local-only price path:

- `dataAsOf <= observedAt <= retrievedAt <= firstExecutableAt` is enforced;
- `retrievedAt` is sampled after actual provider fetch completion;
- J-Quants dates and instants are strict and deterministic;
- malformed/inexplicit timestamps fail closed;
- symlink/hard-link/private-store boundaries fail closed;
- orphan revision roots fail closed;
- Recommendation and Quantitative Outcome revalidate pinned price timelines;
- local price-store audit can report metadata/coverage/issues without printing raw OHLCV or raw JSONL.

This is not a real-market PASS. Still pending locally:

- real J-Quants Free missing/suspension/entitlement measurements;
- rights-verified issuer/TOPIX/sector benchmark availability;
- Corporate Action Evidence / Clearance for raw unadjusted quantitative outcomes.

Do not add another synthetic price architecture layer merely to keep moving.

## Foundation / EDINET read-only chain

The GitHub-safe Foundation path now has a read-only, fail-closed progression:

1. Sanrio real-pilot preflight determines the current local stage;
2. completed parity may expose a read-only Foundation readiness audit;
3. the readiness audit advises the exact read-only remediation-plan command using the generated audit path;
4. remediation plan only orders explicit evidence work and never authorizes evidence collection, field synthesis, replacement or append;
5. structural-status builder requires deterministic explicit-timezone instants;
6. structural-status CLI validates the information cutoff before reading local Security/Evidence/Claim/Document repositories;
7. remediation-plan `generatedAt` requires a deterministic explicit instant;
8. EDINET Foundation mapping/finalization timestamps use the canonical explicit-instant parser;
9. the directly callable reviewed-EDINET Foundation preview API independently rejects timezone-less, impossible Gregorian and invalid-offset instants even when schema validation is bypassed;
10. Foundation hash-witness inputs require explicit instants before canonical UTC hashing;
11. hash-witness conformance requires strict proof-run, Decision, Document Revision and audit instants before timing comparisons;
12. the human replay-proof finalization path requires strict upstream, generated and human-review instants before replay proof flags may become true;
13. the exported Foundation Decision assessor preflights Decision and actually referenced hypothesis/scenario/calibration/price timestamps, preventing direct-call `Date.parse`/NaN fail-open behavior.

Relevant recent PRs:

- #203 — strict instants in Foundation structural status;
- #205 — read-only readiness audit -> exact read-only remediation follow-up;
- #207 — validate Foundation cutoff before local repository reads;
- #208 — deterministic explicit instant in Foundation remediation plan;
- #210 — strict instants in EDINET Foundation mapping;
- #213 — strict instants in the directly callable reviewed EDINET preview API;
- #214 — strict instants in Foundation hash witness;
- #215 — strict instants in Foundation witness conformance;
- #216 — strict instants in Foundation human replay proof;
- #217 — fail closed on direct Foundation Decision assessor instants.

These changes do **not** authorize Foundation append/replacement, Recommendation eligibility, BUY/LINE/order, proof promotion, automatic learning adoption or milestone green.

## Why GitHub-side strict-instant hardening stops here

A targeted Foundation audit was performed after the concrete defects above were closed. Remaining `Date.parse` uses must not be mechanically replaced merely because they exist.

The rule from this point is:

- schema-gated comparisons are not a reason by themselves to create another PR;
- comparisons are acceptable when every participating instant has already passed the canonical explicit-instant boundary;
- only a demonstrated direct-API/schema-bypass fail-open, an actual runtime regression, or a local-pilot failure may reopen this hardening thread.

This prevents endless low-value hardening from displacing the real local evidence work.

## Canonical local resume

When the local Mac and real EDINET evidence are available, start from repo root with:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Then:

1. treat preflight output as the authoritative current local stage;
2. run only the printed `nextCommand`;
3. rerun the same preflight after every successful stage;
4. never guess timestamped filenames;
5. never edit hashes, rename/copy artifacts, or regenerate evidence merely to make lineage pass;
6. do not paste raw EDINET filing contents into chat;
7. if an integrity error appears, preserve files and return only the safe preflight error/output for diagnosis;
8. stop mutating progression at `parity_complete_foundation_gate_pending`.

At `parity_complete_foundation_gate_pending`, preflight intentionally removes the mutating `nextCommand` and may print only the read-only Foundation readiness-audit follow-up. That follow-up remains non-authorizing.

The current advisory path is:

```text
parity_complete_foundation_gate_pending
  -> read-only Foundation readiness evidence-gap audit
  -> exact read-only remediation-plan command from the generated audit
  -> Foundation gate remains pending
```

Automatic mapping, replacement, append or Recommendation creation is not authorized by this path.

## Foundation real-pilot gate remains real

The first real Foundation pilot still requires evidence that GitHub/CI cannot manufacture:

- governed Security Master identity at the correct PIT cutoff;
- explicit bitemporal evidence and document-revision lineage;
- real local EDINET human/parity review;
- real licensed price and benchmark provenance where quantitative measurement is required;
- Corporate Action Clearance where raw/unadjusted prices are used;
- deterministic replay and human review evidence for the actual object chain.

Do not mark any `*_GREEN` real-pilot milestone from synthetic fixtures or CI alone.

## Stop condition for GitHub-side work

After this handoff is merged, do **not** create more Foundation/Security/PIT governance slices merely because code can still be hardened somewhere.

GitHub-side work should resume only when at least one of these is measured:

- a new concrete fail-open defect is reproduced;
- the local preflight/readiness output reveals a specific missing validator or read-only operability problem;
- real J-Quants/benchmark/Corporate Action measurement exposes a concrete contract mismatch;
- an existing CI/runtime regression is measured.

Otherwise the next material step is the local real-evidence chain above.

## Protected boundaries

Never commit or expose:

- `data/edinet` real evidence;
- real licensed price/benchmark payloads;
- J-Quants credentials/tokens;
- Recommendation/Outcome/Learning runtime JSONL;
- portfolio/brokerage data;
- secrets.

Never authorize from these handoff/read-only records:

- automatic BUY;
- broker orders;
- automatic LINE BUY messages;
- automatic Edge promotion;
- automatic Production Gate movement;
- automatic proof promotion;
- automatic learning/code/rule/threshold mutation;
- Cloudflare/D1 write expansion.

Runner/workflow changes remain prohibited unless a measured workflow defect requires them.
