# Decision: consolidate Known-Bad Event Repricing

Date: 2026-08-27

## Decision

`known-bad-event-repricing` is no longer an independent active Research OS Edge. It is retained as deprecated provenance and its formal-event repricing hypothesis is absorbed into `misconduct-overreaction-recovery` as `knownBadSecondaryRepricing`.

## Reason

The two designs share the same misconduct/governance incident universe, PIT information timeline, price and benchmark inputs, and most confounders. Keeping both active would create duplicated research effort and a risk that one incident is counted twice.

No formal Known-Bad samples existed at the time of consolidation, so the change does not require sample or outcome migration.

## Canonical interpretation

- Initial shock recovery is the primary long research route.
- Formal-event D+1/D+3/D+5 repricing is a diagnostic route within the same incident timeline.
- The diagnostic route is used first for WAIT/WATCH, false-bargain detection, and entry-timing research.
- It is not promoted to an automatic short/SELL signal without separate execution, spread and borrow validation.
- The old immutable Edge identity and hypothesis remain available for audit/provenance.
