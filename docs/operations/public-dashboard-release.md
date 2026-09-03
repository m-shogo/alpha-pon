# Alpha Pon Public Dashboard Release

## Goal

Publish the read-only Alpha Pon dashboard from `main` to the existing Cloudflare Worker `alpha-pon` without changing research logic, BUY/SELL rules, or notification behavior.

## Source of truth

- Git branch: `main`
- Worker: `alpha-pon`
- Wrangler config: `wrangler.jsonc`
- Static assets: `apps/web/out`
- Public runtime: `workers.dev`
- D1 binding: `DB` → `alpha-pon-market-events`

## Build

Use the existing verified Worker build:

```bash
bash scripts/build-cloudflare-workers.sh
```

That build delegates to `scripts/build-cloudflare-pages.sh` and verifies:

- market-event contracts and revision guards
- deterministic D1 bootstrap/readiness
- generated calendar JSON/ICS
- `pnpm ui:data`
- Owner Research summary/history map
- web typecheck/lint
- Next.js static export
- required files in `apps/web/out`
- Worker static-assets routing/configuration

Do not replace this with a bare `next build`; the verified build is the release gate.

## Owner Research snapshot freshness semantics

Owner Research uses two different timestamps and they must not be conflated:

- `generatedAt` means when the owner-safe build snapshot was generated.
- `latestResearchAt` means the latest research activity represented by that snapshot.

The Owner Research JSON files are regenerated as part of the verified Cloudflare build. Research OS itself has no time-based schedule or canonical Owner Research max-age/TTL contract: its workflow runs on relevant repository changes or manual dispatch. Therefore the Web UI must **not** invent a 24h/48h/etc. age threshold and must not call a snapshot stale solely because elapsed wall-clock time is large.

For v1, freshness fail-closed means:

- missing snapshot → unavailable
- malformed timestamp → unavailable
- timestamp without an explicit timezone → unavailable
- future-dated timestamp → unavailable
- invalid temporal/reference/integrity semantics → unavailable
- an old-but-valid `generatedAt` alone → **not** enough evidence to declare the snapshot stale

If Research OS later publishes a canonical expected cadence, expected-next-run, `staleAfter`, or equivalent freshness contract, Owner UI may enforce age-based staleness against that source of truth. Until then, display `generatedAt` and `latestResearchAt` factually and independently.

This rule is specific to Owner Research snapshots. Other datasets may have their own explicit freshness contracts and should continue to use them.

## Cloudflare Workers Builds

In Cloudflare Dashboard:

1. Open **Workers & Pages**.
2. Open Worker **alpha-pon**.
3. Open **Settings → Builds**.
4. Confirm the Git repository is `m-shogo/alpha-pon`.
5. Set the production branch to `main`.
6. Set **Root directory** to the repository root (blank/default).
7. Set **Build command** to:

```bash
bash scripts/build-cloudflare-workers.sh
```

8. Set **Deploy command** to:

```bash
npx wrangler deploy
```

9. Confirm the build API token is valid. If Cloudflare reports that the selected build token was deleted or rolled, replace the token in **Settings → Builds → API token** and retry.
10. Save the build settings.

After this, a push/merge to `main` should trigger a production build and deploy automatically.

## Runtime variables

`wrangler.jsonc` intentionally keeps runtime secrets out of Git.

Confirm these exist in Cloudflare Worker **Settings → Variables & Secrets**:

- `PUBLIC_ORIGIN`
- secret `CALENDAR_FEED_TOKEN`

Do not commit their values to Git.

## First production verification

After a successful production deployment, verify the public `workers.dev` URL on both mobile and desktop.

Minimum v1 checks:

- `/` loads the Alpha Pon dashboard.
- `/research/` loads Owner Research state.
- `/calendar/` loads.
- Owner Research generated data is missing/malformed/future-dated/semantically invalid only when the UI fails closed; do not infer an age-based stale state without a canonical freshness contract.
- Pipeline status and Mock/Missing warnings are visible.
- current research, known/unknown state, and next actions are understandable without opening GitHub.
- `/healthz` responds successfully.
- no private credentials or write controls are exposed.

## Release rule

Dashboard v1 is public-ready when all of the following are true:

1. `main` is the intended release revision.
2. `bash scripts/build-cloudflare-workers.sh` succeeds in Workers Builds.
3. `npx wrangler deploy` succeeds.
4. The production `workers.dev` URL renders correctly on mobile and desktop.
5. Dashboard data warnings accurately fail closed rather than hiding missing, malformed, future-dated, or semantically invalid data.

Visual polish beyond those conditions is post-v1 work and should not block initial publication.

## Troubleshooting order

If publication fails, inspect in this order:

1. Cloudflare build token/authentication.
2. Build command failure.
3. Missing generated files in `apps/web/out`.
4. Wrangler config/static asset verification.
5. Runtime variables/secrets.
6. Production route/health check.

Avoid changing research logic merely to make the dashboard deploy.
