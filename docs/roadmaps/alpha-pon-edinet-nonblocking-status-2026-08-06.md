# Alpha Pon EDINET non-blocking status — 2026-08-06

Status: `ACTIVE_SUBROADMAP`
Updated: 2026-08-06 22:40 JST
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
12. **IN PROGRESS — PR #81:** Add a generic read-only configured pipeline dashboard. Verify inventory → review plan → acquisition plan → manifest → workspace hashes, filenames, issuer identity, and safety boundaries without rendering filing text.
13. Add a synthetic pipeline fixture exporter so inventory, review plan, manifest, workspace, and dashboard schemas can be inspected outside unit-test code without real filings.
14. Add a generic configured PDF/source-fidelity review plan after the synthetic exported fixture proves the full metadata pipeline.
15. Run real legacy/configured Sanrio parity locally and human-review the report before considering legacy entry-point replacement.
16. Register a second real issuer only after an inventory-only proposal identifies a measured Evidence Gap and explicit user approval.
17. Resume Known-Bad Event Repricing validation only after the real Foundation pilot gates are satisfied.

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
- A hash-verified configured workspace and dashboard still represent unreviewed source material.
- Keep replacement, Foundation preview eligibility, and append authorization false unless a distinct explicit workflow is reviewed.
- No BUY/order automation, brokerage action, Production Gate change, active Edge promotion, or real LINE send.
- No Cloudflare production deploy or D1 write from this queue.
- Do not modify GitHub Actions runners or cost controls unless a distinct measured workflow defect requires it.
- Wrangler dry-run success is not production deployment.
