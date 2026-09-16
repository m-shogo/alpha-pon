# Alpha Pon Stock Watch — Notification Authority

## Canonical delivery path

All stock-watch Slack notifications must use:

`.github/workflows/stock-watch-notify.yml`

The workflow sends a DM from the Alpha Pon Stock Watch bot using only the repository secret `SLACK_BOT_TOKEN_STOCK_WATCH`.

## Delivery success contract

A notification is considered delivered only when Slack returns all of the following:

- `ok=true`
- a non-empty DM channel ID
- a non-empty message timestamp (`ts`)

Callers must not claim or persist a successful notification before this contract is satisfied.

## Legacy paths

The former ChatGPT automation `6銘柄 買い時監視` is disabled and must not be re-enabled as a parallel Slack sender.

Do not add another Slack webhook, user token, bot token, or independent stock-watch sender. New stock-watch research/alert jobs must dispatch the canonical workflow instead.

`slack-bot-test.yml` is not a production notification path and is retained only as a manual transport diagnostic until removal is verified safe.
