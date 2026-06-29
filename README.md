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
