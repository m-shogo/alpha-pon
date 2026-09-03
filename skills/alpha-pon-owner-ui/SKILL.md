---
name: alpha-pon-owner-ui
description: Design or review Alpha Pon Owner UI screens, especially /research, with responsive Apple-like information hierarchy while avoiding generic AI-generated dashboard patterns. UI only; never change research/trading semantics.
version: 0.1.0
---

# Alpha Pon Owner UI Design Skill

Use this skill when creating, redesigning, polishing or reviewing Alpha Pon owner-facing web UI.

This is a **project-local design reference**. It does not automatically load in every agent. The calling agent must be told to read it, or a future agent-routing file may explicitly reference it.

Before editing, read:
- `docs/design/owner-ui-v2-design-system.md`
- the current page/component code
- relevant generated-data loaders/types
- latest main and open PRs

## Mission

Make Alpha Pon feel like quiet, precise research software.

The owner should understand:
1. what is being researched,
2. what is known,
3. what is unknown,
4. what is next,
5. what evidence/history exists.

Do not optimize for visual novelty. Optimize for clarity, trust, hierarchy and device-appropriate density.

## Hard safety boundary

UI redesign must never modify:
- research logic
- BUY/SELL logic
- Gate calculations
- Research promotion rules
- generated-data semantics/contracts
- LINE/Slack notification behavior
- schedules
- brokerage/trading behavior
- research evidence or historical outcomes

Never fabricate data or charts for visual completeness.

## Design sequence

### 1. Identify the page job

Write one sentence describing what the owner must understand on this screen within ~30 seconds.

If a block does not support that job, reduce its prominence, move it deeper, or remove it from the initial view.

### 2. Audit AI-slop tells

Flag:
- card-everything layouts
- repeated identical radii
- excessive pills
- pastel category coloring
- generic purple/blue gradients
- soft shadows on every surface
- tiny metadata
- developer jargon as primary labels
- giant decorative headers
- arbitrary 3-column grids
- decorative charts
- glassmorphism over content
- mobile layouts merely stretched onto desktop

### 3. Choose hierarchy before styling

Define:
- primary question/status
- secondary context
- detail/disclosure content

Use plain Japanese for primary labels. Technical terms can appear as secondary vocabulary.

### 4. Design mobile and desktop separately

#### Mobile
- one column
- 4–5 primary bottom destinations maximum
- no horizontal primary navigation
- 44px+ primary touch targets
- body 15–17px where possible
- secondary/meta 12–13px
- details progressively disclosed

#### Desktop
- persistent left navigation around 208–232px
- content canvas ~960–1180px
- use table/list density for comparable data
- use multiple columns only when comparison improves comprehension
- no bottom navigation

### 5. Apply restrained visual system

Prefer:
- `#f5f5f7`-like neutral app background
- white content surfaces
- near-black text
- muted gray secondary text
- one restrained blue primary accent
- green/amber/red only for semantic state
- thin dividers before shadows
- cards only for independently meaningful units

Use the system font stack intentionally.

Do not make the page look like an Apple clone. Borrow hierarchy/clarity principles, not proprietary assets.

### 6. Use the right container

Choose intentionally:
- summary surface: for top-level state
- grouped list: for related rows
- table: for desktop comparison
- disclosure: for deep technical detail
- badge: only for compact state
- card: only when an item must stand independently

If everything is a card, redesign it.

### 7. Keep motion functional

- 160–220ms transitions
- no dashboard entrance choreography
- no staggered fade-in decoration
- support reduced motion

### 8. Accessibility review

Check:
- text size
- touch target size
- contrast
- keyboard focus
- state not conveyed by color alone
- text enlargement does not overlap/truncate
- mobile/tablet/desktop layouts independently

## Research-page specific hierarchy

Prefer this order:
1. current research state + health
2. what we know / what we do not know / what is next
3. formal edge progress
4. recent timeline
5. historical analog / study / lineage detail

Do not let Historical Analog or Study inventories visually overpower current research state.

## Copy rules

Prefer:
- `研究中`
- `実運用前の観察 (Shadow)`
- `実運用 (Production)`
- `本番昇格の条件クリア (Promotion Ready)`
- `過去類似事例`
- `サンプル`

Avoid developer-facing primary labels such as raw enum names, `error / warn`, `Research Summary`, or `Knowledge Map` when a natural Japanese label communicates the same thing.

## Finish criteria

Before calling the UI done, verify:
- owner can identify the current research state quickly
- mobile has no horizontally scrolling primary nav
- desktop does not look like a narrow phone column
- essential text is not 9–10px
- the screen does not rely on repeated pastel rounded cards
- no research semantics changed
- CI/build passes
- production visual QA is performed when deployment is available
