# Alpha Pon Owner UI v2 — Design System

Status: proposed implementation authority for Owner UI work
Scope: public/read-only Owner UI, starting with `/research`
Tracking: #1734

## 1. Product design goal

Alpha Pon is a research tool, not a generic SaaS dashboard. The interface must help one owner answer these questions quickly:

1. What is being researched now?
2. What do we currently know?
3. What is still uncertain?
4. What will be researched next?
5. What evidence/history supports the current state?

The target feeling is **quiet, precise, trustworthy research software**. Use Apple-like information design principles (hierarchy, clarity, restraint, consistency) without copying Apple assets or reproducing a platform UI literally.

The interface must not look like a default AI-generated Tailwind/shadcn dashboard.

## 2. Core principles

### 2.1 Simple is not empty

Simplicity means the owner can find the answer without effort. Do not hide important context just to make a screen look minimal.

Every element must answer at least one of:
- what matters now?
- what changed?
- what is uncertain?
- what should I inspect next?

### 2.2 Content before chrome

Navigation, glass, borders, shadows and decoration are subordinate to research content.

Use translucency/blur only for floating or sticky navigation chrome. Never place long research text on translucent surfaces.

### 2.3 Fewer cards, stronger hierarchy

Do not put every block inside a rounded card.

Use:
- page sections
- grouped lists with separators
- compact tables on desktop
- disclosure rows
- status rows
- one or two true summary surfaces at the top

Use cards only when an item is independently actionable or needs clear separation from its surroundings.

### 2.4 Japanese first

Primary labels must be natural Japanese. Internal/technical terms may remain as secondary vocabulary when they are useful for correspondence with Research OS.

Example:
- `実運用前の観察` (Shadow)
- `本番昇格の条件クリア` (Promotion Ready)

Do not expose raw enum values as the primary UI.

### 2.5 Semantic color only

Color must communicate meaning, not fill empty space.

Recommended roles:
- primary accent: restrained blue
- success/confirmed: green
- caution/unknown: amber
- destructive/rejected/error: red
- neutral/inactive: gray

Avoid purple/pink/pastel fields as general decoration. Avoid gradients except for rare branded/illustrative moments outside dense research content.

### 2.6 Typography carries hierarchy

Use the system font stack intentionally. For an Apple-like research interface, a system sans is a deliberate choice, not an unstyled default.

Recommended web sizes:
- page title: 28–34px desktop, 26–30px mobile
- section title: 19–22px
- card/list title: 15–17px
- body: 15–17px mobile, 14–16px desktop
- secondary/meta: 12–13px
- avoid essential information below 12px

Prefer regular/medium/semibold weights. Do not rely on 800–900 weight everywhere to create hierarchy.

### 2.7 Progressive disclosure

The first screen should summarize. Details should be available without disappearing into another product.

Order:
1. summary
2. known / unknown / next
3. edge state
4. timeline
5. historical analog / study / lineage detail

Long evidence, full hypotheses, and technical verification gaps should be disclosure content, not initial-screen content.

## 3. Responsive architecture

### 3.1 Mobile — under 768px

Goal: one-handed scan, no horizontal primary navigation.

- one-column content
- 16px side padding (14px minimum only for very dense sections)
- bottom navigation limited to 4–5 primary destinations
- additional destinations behind `その他`
- primary touch targets >= 44px
- avoid two-column metric grids when the labels become tiny
- summary can use one large state row plus 2 compact supporting values
- dense desktop tables become stacked labeled rows/cards
- disclosures start closed unless the content is essential

Suggested primary bottom destinations:
1. ホーム
2. 研究
3. 銘柄
4. 候補
5. その他

`その他` contains: 予定 / 行動 / 資料 / 運用.

### 3.2 Tablet — 768–1023px

- content width up to ~880px
- 2-column summary where it improves comparison
- bottom navigation may remain, but no horizontal scrolling
- keep body copy at comfortable reading width

### 3.3 Desktop — 1024px and above

Goal: research workstation, not a stretched phone.

- persistent left navigation: ~208–232px
- content canvas: ~960–1180px depending on page
- optional right contextual rail only when there is real secondary context
- two-column research overview where content pairs naturally
- historical analogs and study inventories may use tables/list rows
- no bottom navigation
- page title/header should not consume excessive vertical space

## 4. Visual tokens

Initial direction; implementation may tune contrast after browser QA.

```css
--ap-bg: #f5f5f7;
--ap-surface: #ffffff;
--ap-surface-muted: #f2f2f4;
--ap-ink: #1d1d1f;
--ap-ink-secondary: #6e6e73;
--ap-ink-tertiary: #86868b;
--ap-line: rgba(29, 29, 31, 0.10);
--ap-line-strong: rgba(29, 29, 31, 0.16);
--ap-accent: #0071e3;
--ap-success: #248a3d;
--ap-warning: #b05a00;
--ap-danger: #d70015;
```

Rules:
- one dominant neutral background
- white content surfaces
- shadows should be rare and low-amplitude
- divider-first hierarchy before shadow-first hierarchy
- major surfaces radius 14–18px
- list rows and tables generally do not need rounded containers
- pills only for true compact states/filters

## 5. Research page information architecture

### 5.1 Header

Show:
- `研究`
- plain-language subtitle
- last research activity time
- generated snapshot time as secondary metadata

Do not use a large developer eyebrow like `RESEARCH / OWNER VIEW`.

### 5.2 First viewport: current state

Primary content:
- current Research OS health
- number/stage of active formal edges
- current research item count
- short status sentence such as `2件を研究中。昇格条件を満たしたEdgeはまだありません。`

Avoid six equal-weight KPI cards.

### 5.3 Known / Unknown / Next

Create a visually obvious 3-part block:
- 分かったこと
- まだ分からないこと
- 次に調べること

This is more important than raw registry counts.

### 5.4 Formal edges

Desktop:
- concise list/table rows with stage, sample, analog, gate, last research
- row expands to show hypothesis/findings/gaps/next actions

Mobile:
- one edge summary surface per edge
- stage and progress at top
- known/unknown/next collapsed below

Do not nest many rounded cards inside an edge card.

### 5.5 Timeline

Use a chronological list with a strong time marker and compact content. Avoid a full card per timeline event unless an event is exceptional.

### 5.6 Historical analog / studies / lineage

These are deeper research context. They should not visually compete with current research state.

Desktop:
- table/list density where appropriate
- row expansion for evidence detail

Mobile:
- stacked labeled rows
- no horizontally overflowing data table

## 6. Anti-AI-slop rules

Reject these defaults unless specifically justified:
- purple/blue gradients as generic brand treatment
- every section as the same rounded white card
- pastel color assigned to every category
- large soft shadows on ordinary content
- excessive pills/badges
- glassmorphism on content surfaces
- 3-card grids simply because three columns fit
- giant empty hero space in an operational dashboard
- centered marketing-style headings
- tiny metadata used to fit too much information
- arbitrary animation on page load
- decorative charts with no analytical purpose

Do not replace one template aesthetic with another. Each component must reflect the research task it serves.

## 7. Motion

- default transitions: ~160–220ms
- motion is for state continuity, not decoration
- avoid staggered fade-in animations for dashboard content
- respect `prefers-reduced-motion`

## 8. Accessibility

- essential mobile controls target >= 44px
- avoid essential text below 12px; body should be larger
- do not rely on color alone for state
- preserve keyboard focus visibility
- verify contrast after token implementation
- layouts must survive increased text size without overlap/truncation

## 9. Engineering rules

- do not change Research OS semantics while redesigning UI
- do not alter BUY/SELL, Gate calculations, generated-data contracts, LINE, schedules or trading behavior
- prefer reusable CSS/classes/components over repeated inline style objects
- keep fail-closed availability warnings prominent and independent
- do not invent charts/data to improve aesthetics
- mobile and desktop must be QA'd separately
- use real generated data for layout stress testing

## 10. Implementation roadmap

### Phase 1 — responsive shell/navigation
- desktop sidebar
- mobile bottom navigation <= 5 destinations + More
- remove primary-nav horizontal scrolling
- research desktop content width expansion

### Phase 2 — research hierarchy
- rebuild first viewport
- known / unknown / next
- formal edge list/card responsive variants
- larger readable typography

### Phase 3 — deep research views
- analogs/studies/lineage density
- desktop tables, mobile rows
- reduce nested cards

### Phase 4 — QA
- 375/390px mobile
- tablet
- 1280/1440px desktop
- enlarged text
- light/dark if/when dark mode is intentionally supported

## 11. External research basis

This design direction was informed by current guidance and community feedback reviewed on 2026-09-03, including:
- Apple Human Interface Guidelines: hierarchy, typography, accessibility, charting data
- Apple WWDC26 `Principles of great design`: simplicity as clarity rather than visual minimalism
- Apple WWDC25/26 design-system guidance: restrained concentric shapes and platform harmony
- Vercel 2026 dashboard navigation redesign: desktop sidebar + mobile one-handed navigation
- contemporary UI/UX community feedback about recognizable AI-generated layouts (rounded-card repetition, gradients, default Tailwind/shadcn styling, weak intent)

External design skills may be used as inspiration, but this document is the Alpha Pon-specific authority for Owner UI design decisions.