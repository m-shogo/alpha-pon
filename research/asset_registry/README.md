# Research Asset Registry

`research/asset_registry/` is the canonical identity registry for repository assets referenced by Research Knowledge as external `document`, `watch`, or `implementation` nodes.

## Why this exists

Research relations must not use repository paths as identity. Paths can move; a stable Research Asset ID must survive a rename without changing the semantic graph.

The registry therefore separates:

- **identity and current location** — `assets/<asset-id>.yml`
- **PIT first-known provenance** — `provenance.jsonl`

A registered asset without provenance is visible to the authority as an ID, but it is intentionally unavailable to strict Research Knowledge relations until canonical-main provenance is appended.

## Asset record rules

- one YAML file per stable asset ID
- filename must be `<id>.yml`
- `id` and `assetType` are identity-bearing and immutable
- `path`, `status`, and `description` may evolve through reviewed Git changes
- the current `path` must resolve to a regular repository file, never a symlink
- `document`, `watch`, and `implementation` are reference authorities only; they do not become ResearchItems or Formal Edges

## Provenance lifecycle

`provenance.jsonl` is append-only. One canonical first-known fact is allowed per asset ID.

For `basis: canonical_git_first_presence`:

- `sourceCommitSha` must be a canonical-main commit
- `sourceCommitAt` must equal `firstKnownAt`
- `sourcePath` is the path whose first canonical-main presence establishes availability

A new asset may merge before provenance exists. Do not invent branch timestamps to close that gap. Append provenance only after the canonical Git fact is verifiable.

## Non-goals

This registry does not contain document bodies, watch rules, implementation source, research evidence, outcomes, or Claim Graph facts. Those remain in their owning files/stores.
