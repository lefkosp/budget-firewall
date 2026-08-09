# Budget Firewall

Personal finance app: connect bank accounts, import transactions, and surface spending patterns before money leaks.

**Status:** ACTIVE (in development)  
**Portfolio:** [lefkos.dev](https://lefkos.dev/#lab)

## Built

- Next.js app shell with auth (login/register)
- Open-banking connect flow (GoCardless)
- Transaction import and listing
- Dashboard and analytics views with charting

## Next

- Budget rules engine
- Intent-based spending alerts
- Collaborators flow (stub routes exist)

## Constraints

- **EUR only (v1).** Revolut accounts can hold multiple currency pockets, so
  an imported CSV may contain non-EUR rows. Those rows are still imported and
  visible in the transaction list, but are excluded from every total, budget,
  subscription, and analytics calculation -- there's no FX conversion yet, so
  summing across currencies would silently produce a meaningless number
  rather than a wrong-but-plausible one. The import summary reports how many
  rows were excluded this way. Full multi-currency support (grouped by
  currency, or normalized via FX rates) is deferred to post-productization.

## Stack

Next.js 16, React 19, TypeScript, Tailwind, Radix/shadcn, Recharts

## Local development

```bash
npm install
npm run dev
```

Environment variables for open banking and auth are required. See
`backend/.env.example`.

## Background sync

`POST /api/cron/sync-all` re-syncs every linked bank connection from its
last-synced cursor. It's not an in-process scheduler -- this deploys as a
normal web dyno, not an always-on worker -- so it's meant to be triggered by
the hosting platform's scheduled-task product (Railway Cron / Render Cron
Jobs) or a GitHub Actions `schedule:` job, roughly every 6h:

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<backend-host>/api/cron/sync-all
```

## License

Private / personal project.
