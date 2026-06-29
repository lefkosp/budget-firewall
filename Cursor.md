# Budget Firewall (MVP) — Revolut-only personal finance + accountability

## Goal

Build a personal money management app that connects to Revolut via Open Banking aggregation, syncs transactions, enforces strict budgets using a rules engine (soft blocks), and adds accountability via collaborator approvals and pre-approval intents.

"MVP ready fast" is the top priority. Only Revolut is required.

---

## MVP Scope (must-have)

### 1) Revolut connection + sync

- Connect Revolut using an Open Banking aggregator (GoCardless Bank Account Data / Nordigen-style flow).
- Store: accounts, balances (optional), transactions.
- Sync schedule: manual "Sync now" + background sync (e.g., every 6 hours).
- Idempotent imports (same transaction should not duplicate).

### 2) Transaction classification

For each transaction, compute:

- merchantNameNormalized (best effort from transaction description)
- category (initial: "unknown", later rules can assign)
- flags:
  - isGambling (category OR merchant match)
  - isCrypto (category OR merchant match)
  - isBlacklistedMerchant
  - isOverBudget (category budget exceeded)
  - requiresApproval (amount >= threshold OR in sensitive category)

Use BOTH:

- merchant name matching (string contains / fuzzy)
- category matching (if aggregator provides category/mcc-like info)

### 3) Budgeting (strict)

- Monthly budgets per category.
- Category budgets can be "hard cap" in the UI:
  - if exceeded, mark further transactions as violations.
- Show budget usage:
  - spent / remaining
  - projected end-of-month spend (optional)

### 4) Rules engine (soft blocks)

Rules types:

- Merchant blacklist: block/flag any transaction where merchant matches list
- Gambling block: flag if gambling
- Crypto deposits block: flag if crypto-related
- Approval threshold: if amount >= X, requires approval
- Category lock: if category exceeds budget, mark subsequent as violations

Rules output:

- status per transaction: Approved | Pending Approval | Violation | Neutral
- reason(s) list

### 5) Collaboration (accountability buddy)

- Invite collaborators by email.
- Permissions (MVP = "all"):
  - view transactions, budgets, rules
  - approve/deny transactions
  - approve/deny intents
- Approval workflow:
  - Any transaction requiring approval starts as Pending Approval.
  - Buddy can Approve/Deny with optional note.
  - Denied => Violation (but still recorded).

### 6) Pre-approval "Intent" feature (cheap pre-approval)

- User can create an Intent:
  - amount, merchant (free text), category, note, expiry date
- Buddy approves/denies intent
- When new transactions arrive, attempt to match:
  - absolute amount diff <= tolerance (e.g. €2)
  - merchantNameNormalized contains intent merchant text (case-insensitive)
  - within intent expiry window
- If matched + approved => mark transaction as Approved (intent-backed)
- If matched but denied => Violation
- If requiresApproval and no intent => Pending Approval

### 7) Dashboard

- Month score:
  - Total spend, total violations, approvals pending
  - Gambling/crypto count this month
- List of "Violations" and "Pending approvals" (top priority sections)

---

## Non-goals for MVP

- Hard blocking/declining transactions at the bank/card authorization level.
- Multi-bank support.
- Advanced ML categorization.
- Receipt scanning.

---

## Suggested Tech Stack (opt for speed)

- Frontend: Next.js + React + Tailwind
- Backend: Node.js + Express
- Auth: simple email magic link or password (keep minimal)
- DB: MongoDB (via Mongoose)
- Background jobs: cron (server cron or node-cron) to sync transactions
- Open Banking: GoCardless Bank Account Data API integration

---

## Data Model (high level)

User

- id, email, name

Collaborator

- id, ownerUserId, collaboratorUserId, role="collaborator"

BankConnection

- id, ownerUserId, provider="gocardless", requisitionId, status, createdAt

Account

- id, ownerUserId, providerAccountId, name, ibanMasked?, currency

Transaction

- id, ownerUserId, accountId
- providerTransactionId (unique)
- bookedAt, amount, currency
- rawDescription, merchantNameNormalized
- providerCategory?
- computedCategory
- flags: isGambling, isCrypto, isBlacklisted, isOverBudget
- approvalStatus: Neutral | Pending | Approved | Denied | Violation
- approvalRequired: boolean
- matchedIntentId?

Rule

- id, ownerUserId
- type: MERCHANT_BLACKLIST | GAMBLING | CRYPTO | APPROVAL_THRESHOLD | CATEGORY_BUDGET
- config JSON
- enabled boolean

BudgetCategory

- id, ownerUserId
- name
- monthlyLimit

Intent

- id, ownerUserId
- amount, merchantText, category, note
- expiresAt
- status: Pending | Approved | Denied

Approval

- id, ownerUserId, actorUserId (buddy)
- targetType: Transaction | Intent
- targetId
- decision: Approved | Denied
- note, createdAt

---

## Screens (MVP)

1. Login
2. Connect Revolut (Open Banking consent)
3. Dashboard (month totals + violations + pending approvals)
4. Transactions (filters: violations/pending/gambling/crypto)
5. Budgets (edit limits)
6. Rules (toggle rules + edit thresholds + merchant lists)
7. Intents (create + pending approvals)
8. Collaborators (invite + list)

---

## Acceptance Criteria (MVP)

- User connects Revolut and sees transactions imported.
- Rules mark gambling/crypto/blacklist and budget exceed as violations.
- Transactions above threshold become Pending Approval.
- Collaborator can approve/deny; status updates immediately.
- Intents can be approved before spending; matching works on incoming transactions.
- No duplicates on sync.
