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

Environment variables for open banking and auth are required. See `.env.example` when added.

## License

Private / personal project.
