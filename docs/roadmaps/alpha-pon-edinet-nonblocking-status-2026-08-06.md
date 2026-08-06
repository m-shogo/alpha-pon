# Alpha Pon EDINET non-blocking status — 2026-08-06

Status: `ACTIVE_SUBROADMAP`
Updated: 2026-08-06 19:09 JST
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

Do not repeatedly block the development queue on this command. Surface it again only when the Sanrio pilot needs to cross one of these gates:

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
```

## Non-blocking implementation queue

Proceed in this order unless current `main`, tests, or real measured data show a stronger dependency:

1. Batch and prioritize the `review_next` correction candidates without assigning materiality.
2. Add full-text/table extraction support for exact before/after amounts and footnotes.
3. Add explicit financial-statement, internal-control, and audit-opinion change checklists.
4. Generalize the proven EDINET correction pipeline from the Sanrio boundary to a configured issuer boundary.
5. Add a local review UI/report that consumes governed JSON but does not mutate Foundation stores.
6. Prepare the Security Master and PIT-time mapping inputs required for a non-appendable Foundation preview.
7. Resume Known-Bad Event Repricing validation only after the real Foundation pilot gates are satisfied.

## Safety invariants

- GitHub `main`, current code/tests/workflows, and measured output are authoritative; old chat SHAs are not.
- Do not commit local EDINET ZIP/PDF/API payloads, secrets, licensed prices, or portfolio data.
- Do not expose the EDINET API key in Git, logs, PRs, Issues, Actions artifacts, or chat.
- Do not add broad APIs until the pilot identifies a specific Evidence Gap.
- Do not auto-classify source text as confirmed fact, material, positive, negative, or fraud.
- Keep new fact, previously known fact, assumption/inference, and opinion separate.
- Keep `appendAuthorized=false` until governed human review and Foundation requirements are complete.
- No BUY/order automation, brokerage action, Production Gate change, active Edge promotion, or real LINE send.
- No Cloudflare production deploy or D1 write from this queue.
- Do not modify GitHub Actions runners or cost controls unless a distinct, measured workflow defect requires it.
- Wrangler dry-run success is not production deployment.
