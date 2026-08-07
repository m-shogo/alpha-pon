# Alpha Pon EDINET non-blocking status — 2026-08-06

Status: `ACTIVE_SUBROADMAP`
Updated: 2026-08-07 09:50 JST
Parent roadmap: `docs/roadmaps/alpha-pon-current-roadmap-2026-08-06.md`

## Durable operating decision

The pending local Sanrio PDF visual review is a gate for fact confirmation and Foundation/Evidence append. It is **not** a gate for unrelated implementation work.

Continue autonomous GitHub implementation while the local task remains pending.

## Pending human/local task — keep open

Source:

```text
data/edinet/sanrio-acquisition.20260806T064708Z/revision-unmatched-anchor-inspection-v1.20260806T092942Z.json
```

Measured state:

```text
API/PDF selected anchors: 21
matched anchors: 20
unmatched anchors: 1
pending anchors: 0
diagnostic PDF contexts for the remaining anchor: 8
reviewStatus: pending_human_review
appendAuthorized: false
```

Required local action when convenient:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --inspection data/edinet/sanrio-acquisition.20260806T064708Z/revision-unmatched-anchor-inspection-v1.20260806T092942Z.json
```

The user must run this because the source files exist only under the user's local `data/edinet` directory. GitHub and CI cannot access or prove those local records.

Do not block unrelated implementation on this command. Surface it again only when the Sanrio pilot needs to cross one of these gates:

- final equivalence decision for the remaining anchor;
- confirmed exact amount, period, recipient, or payer;
- confirmed financial-statement impact;
- confirmed internal-control or audit-opinion impact;
- human-reviewed Foundation preview input;
- Evidence or Document Revision append.

## Completed EDINET implementation chain

```text
#54 EDINET v2 authentication
#55 exact document acquisition and lineage
#56 human-reviewed Foundation preview contract
#57 local reviewed-preview CLI
#58 Sanrio pilot bootstrap
#59 nullable metadata hardening
#60 safe batch acquisition
#61 human review workspace
#62 correction diff extraction
#63 logical PublicDoc alignment
#64 cross-period triage
#65 focused correction review
#66 API/PDF source fidelity
#67 pending/unmatched semantic separation
#68 unmatched anchor diagnostic contexts
#69 governed human review decisions
#70 review-next exception/representative batching
#71 review-next full-text, numeric, footnote, and accounting-line bundle
#72 governed financial-statement, internal-control, and audit-opinion checklist
#73 configured issuer registry and exact issuer boundary
#74 configured inventory-only pilot with strict identity and type allowlist
#75 legacy/configured inventory compatibility audit
#76 read-only local review dashboard with stage hash and safety checks
#77 governed Security Master, PIT, section-hash, and revision-lineage Foundation preview mapping
#78 generic configured-issuer downstream review plan before acquisition
#79 explicit configured local acquisition with complete-only canonical manifest
#80 schema-versioned configured acquired-file review workspace v2
#81 generic configured pipeline dashboard with hash, lineage, issuer, and safety checks
#82 deterministic synthetic configured pipeline exporter
#83 configured source-fidelity plan with type 1/type 2 pairing
#84 explicit local structured/PDF extraction and empty anchor template
#86 exact human anchor lineage finalization
#87 conservative exact-normalized anchor comparison
#88 issuer-neutral official-PDF human comparison review
#89 Sanrio legacy/configured parity workspace
#90 Sanrio legacy/configured parity human finalizer
```

## Non-blocking implementation queue

Proceed in this order unless current `main`, tests, or measured local data show a stronger dependency:

1. **COMPLETE — PR #70:** Batch and prioritize `review_next` candidates without assigning materiality.
2. **COMPLETE — PR #71:** Extract exact PublicDoc full text and numeric/footnote/accounting-line navigation candidates.
3. **COMPLETE — PR #72:** Record financial-statement, internal-control, and audit-opinion decisions separately with cited evidence.
4. **COMPLETE — PR #73:** Establish the configured issuer registry and fail-closed identity boundary.
5. **COMPLETE — PR #74:** Add a configured inventory-only pilot with no filing download.
6. **COMPLETE — PR #75:** Add legacy/configured inventory compatibility auditing while keeping replacement unauthorized.
7. **COMPLETE — PR #76:** Add the local read-only Sanrio review dashboard.
8. **COMPLETE — PR #77:** Add explicit Security Master, PIT, source hash, section hash, license, storage, and revision mapping for non-appendable Foundation previews.
9. **COMPLETE — PR #78:** Add a generic configured-issuer review plan and synthetic non-Sanrio boundary before acquisition.
10. **COMPLETE — PR #79:** Add an explicit configured local acquisition executor with type 1/2-only tasks, no automatic external parent, local SHA lineage, and no canonical manifest after partial failure.
11. **COMPLETE — PR #80:** Add a generic acquired-file review workspace v2 with binary/metadata re-hashing and independent schema lineage.
12. **COMPLETE — PR #81:** Add a generic read-only configured pipeline dashboard. Verify all five stage hashes, filename/hash lineage, issuer identity, and safety boundaries without rendering filing text.
13. **COMPLETE — PR #82:** Export the complete configured metadata pipeline as deterministic synthetic JSON/Markdown/HTML and plain-text placeholder binaries with no network, credentials, real issuer, or real filing content.
14. **COMPLETE — PR #83:** Pair each configured workspace type 1 source with its verified type 2 official PDF while keeping anchors empty and all decisions unknown.
15. **COMPLETE — PR #84:** Add explicit local structured/PDF extraction, binary/hash/magic revalidation, safe PublicDoc extraction, layout-preserving PDF text, and an empty human anchor template.
16. **COMPLETE — PR #86:** Finalize human-selected anchors by exact structured entry/line and PDF page/line lineage. PR #86 replaced closed PR #85.
17. **COMPLETE — PR #87:** Compare finalized anchors with NFKC plus horizontal-whitespace normalization only. Report exact normalized equality or mismatch pending official PDF visual review; never infer semantic equivalence.
18. **COMPLETE — PR #88:** Require official PDF visual review for every generic comparison anchor and record equivalence, facts, prior facts, assumptions, opinions, exact amounts, accounting/internal-control/audit impact, materiality, and direction separately.
19. **COMPLETE — PR #89:** Build a local Sanrio legacy/configured parity workspace from a green inventory compatibility audit plus both completed human-review records. Machine relations are limited to shared `docID` and exact text-hash equality; raw reviewed text is not copied and replacement remains unauthorized.
20. **COMPLETE — PR #90:** Finalize the parity workspace with explicit human legacy-to-configured mappings, configured-only dispositions, inventory-audit confirmation, and a human replacement recommendation. Even a `recommend_configured_replacement` result remains non-authorizing and cannot mutate the legacy entry point automatically.
21. **BLOCKED — REAL PARITY EVIDENCE REQUIRED:** Add the configured human-review-to-Foundation mapping gate only after the real Sanrio parity review is completed locally and proves the generic record supplies the required Security Master, PIT, source hash, section hash, license/storage, and revision fields. Do not infer or synthesize this evidence in GitHub/CI.
22. Register a second real issuer only after an inventory-only proposal identifies a measured Evidence Gap and explicit user approval.
23. Resume Known-Bad Event Repricing validation only after the real Foundation pilot gates are satisfied.

## Current CI infrastructure note

On 2026-08-07 JST, GitHub-hosted Actions intermittently failed before checkout while resolving `actions/*` metadata:

```text
Service Unavailable
Failed to resolve action download info
```

This is an Actions service failure, not a repository test result. Do not modify workflows, runners, or cost controls in response. Re-run the same commit after the hosted service recovers.

## Safety invariants

- GitHub `main`, current code/tests/workflows, and measured output are authoritative; old chat SHAs are not.
- Do not commit local EDINET ZIP/PDF/API payloads, secrets, licensed prices, or portfolio data.
- Do not expose the EDINET API key in Git, logs, PRs, Issues, Actions artifacts, or chat.
- Do not add broad APIs until a measured Evidence Gap requires them.
- Do not auto-classify source text as confirmed fact, material, positive, negative, or fraud.
- Keep new facts, previously known facts, assumptions/inference, and opinion separate.
- A generated Foundation preview is not a governed store append.
- Review plans never authorize automatic acquisition; the configured executor requires an explicit local command flag.
- Partial acquisition attempts never create a canonical complete manifest.
- A hash-verified configured workspace, dashboard, synthetic fixture, fidelity plan, extraction bundle, anchor record, comparison report, human review record, parity workspace, or parity human-review record still requires the next governed gate before Foundation append or legacy replacement.
- Synthetic placeholder binaries must never be parsed or presented as official EDINET filings.
- Fidelity plans must not manufacture anchors, extract text automatically, or decide equivalence/materiality/direction.
- Explicit extraction success does not authorize anchor generation, comparison, or fact promotion.
- Finalized anchor lineage proves only that selected locations match the extracted files; it does not prove normalized equality, visual fidelity, semantic equivalence, accounting impact, materiality, or direction.
- PDF layout normalization must preserve leading indentation, internal blank lines, and page separators; only line endings and trailing horizontal whitespace may be normalized.
- Exact comparison may apply only NFKC and horizontal-whitespace normalization. It must not remove punctuation, alter numbers, fold case, reorder words, join lines, use fuzzy matching, or infer semantic equivalence.
- Exact normalized equality still requires official PDF visual review and does not authorize a fact or impact decision.
- A normalized mismatch remains pending human review; it is not automatically a substantive difference.
- Human comparison review must not derive decisions from the normalized result automatically. Every visual/equivalence/impact/materiality/direction field is explicit human input.
- Confirmed facts, previously known facts, assumptions, and opinions must remain separate arrays.
- A complete human comparison record does not automatically promote facts or authorize Foundation/Evidence append.
- Legacy/configured parity may auto-relate records only by shared exact `docID` and exact SHA-256 text hashes. Exact hash equality is navigation evidence, not semantic equivalence or replacement authorization.
- Parity workspaces must not copy raw reviewed source text when a hash is sufficient.
- Parity human review must not auto-select machine exact-hash candidates, and a human replacement recommendation must never become replacement authorization by itself.
- The Foundation mapping gate must remain blocked until real local parity evidence exists; CI fixtures cannot satisfy or bypass that gate.
- Keep replacement, Foundation preview eligibility, and append authorization false unless a distinct explicit human-reviewed workflow is completed.
- No BUY/order automation, brokerage action, Production Gate change, active Edge promotion, or real LINE send.
- No Cloudflare production deploy or D1 write from this queue.
- Do not modify GitHub Actions runners or cost controls unless a distinct measured workflow defect requires it.
- Wrangler dry-run success is not production deployment.
