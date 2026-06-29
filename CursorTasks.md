# Budget Firewall MVP — Task-by-Task Plan (Cursor-ready)

> Goal: ship a Revolut-only personal finance + accountability MVP FAST.
> Approach: Next.js (App Router) frontend + Node.js Express backend + MongoDB (Mongoose) + Open Banking aggregator (GoCardless Bank Account Data / Nordigen-style) + simple rules engine + collaborator approvals + pre-approval Intents.

---

## 0) Repo + Tooling Setup

### T0.1 — Create project

- [ ] Create Next.js app (TypeScript) for frontend
- [ ] Create Express backend server
- [ ] Add Tailwind to frontend
- [ ] Add ESLint + Prettier
- [ ] Add env handling (`.env.local`)

**Commands**

```bash
# Frontend
npx create-next-app@latest budget-firewall --ts --eslint --tailwind --app
cd budget-firewall

# Backend setup
mkdir server
cd server
npm init -y
```

### T0.2 — Install core deps

**Frontend:**

- Basic UI primitives (shadcn)
- HTTP client (axios or fetch)

**Backend:**

- Express + TypeScript
- Mongoose (MongoDB ODM)
- Zod for validation
- Auth library (pick one: JWT + bcrypt OR simple custom magic-link)
- CORS middleware

**Commands**

```bash
# Frontend
npm i axios

# Backend
cd server
npm i express mongoose zod jsonwebtoken bcrypt cors dotenv
npm i -D @types/express @types/node @types/jsonwebtoken @types/bcrypt @types/cors typescript ts-node nodemon
```

**Environment variables (.env.local for frontend, .env for backend):**

```bash
# Backend .env
# DB
MONGODB_URI="mongodb://localhost:27017/budget_firewall"

# Open Banking Provider (example keys; set to actual)
OB_PROVIDER="gocardless"
GOCARDLESS_SECRET_ID=""
GOCARDLESS_SECRET_KEY=""

# App
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:3001"
JWT_SECRET=""

---

## 1) Database + Domain Model (MongoDB + Mongoose)
T1.1 — Mongoose schemas (MVP models)

Create models in `/server/models/`:

User

_id (ObjectId), email (unique), name, createdAt

Collaborator

_id, ownerUserId (ref User), collaboratorUserId (ref User), role ("collaborator"), createdAt

BankConnection

_id, ownerUserId (ref User), provider ("gocardless"), requisitionId (unique), status ("CREATED" | "LINKED" | "EXPIRED" | "REVOKED"), createdAt

Account

_id, ownerUserId (ref User), providerAccountId (unique per provider), name, currency, createdAt

Transaction

_id, ownerUserId (ref User), accountId (ref Account), providerTransactionId (unique index), bookedAt, amount, currency, rawDescription, merchantNameNormalized, providerCategory (string nullable), computedCategory (string default "unknown"), flags: { isGambling, isCrypto, isBlacklisted, isOverBudget }, approvalRequired (boolean), approvalStatus (enum: "NEUTRAL" | "PENDING" | "APPROVED" | "DENIED" | "VIOLATION"), matchedIntentId (ref Intent, nullable), createdAt

Rule

_id, ownerUserId (ref User), type (enum: "MERCHANT_BLACKLIST" | "GAMBLING" | "CRYPTO" | "APPROVAL_THRESHOLD"), config (Mixed/JSON), enabled (boolean), createdAt

BudgetCategory

_id, ownerUserId (ref User), name, monthlyLimit (Number, in cents), createdAt

Intent

_id, ownerUserId (ref User), amount (Number, cents), merchantText, category, note, expiresAt, status (enum: "PENDING" | "APPROVED" | "DENIED"), createdAt

Approval

_id, ownerUserId (ref User), actorUserId (ref User, buddy), targetType (enum: "TRANSACTION" | "INTENT"), targetId (ref Transaction/Intent), decision (enum: "APPROVED" | "DENIED"), note, createdAt

 Create Mongoose schemas

 Set up indexes (unique on providerTransactionId, etc.)

 Connect to MongoDB

Commands

# Create models directory
mkdir -p server/models

# Start MongoDB (local or use MongoDB Atlas)
# mongod (if local)

# Test connection in server/index.ts or server/db.ts

T1.2 — Seed initial defaults

On first user creation:

 Create default rules:

Approval threshold (e.g., €50)

Gambling block enabled

Crypto block enabled

Merchant blacklist (empty list)

 Create default categories + budgets (optional minimal set)

## 2) Authentication + Permissions (Fast & Minimal)
T2.1 — Implement auth

Backend: Express auth middleware

Option A: JWT tokens (fastest for MVP)

Option B: Session-based (express-session)

Option C: Minimal custom auth (email magic link + token collection in MongoDB)

MVP requirement:

 Sign in endpoint

 JWT middleware to identify current user in Express routes

 Frontend: protect all pages except login (redirect if no token)

T2.2 — Permission helpers

Backend middleware/helpers:

 requireUser() returns userId from JWT/session

 canViewOwnerData(viewerId, ownerId) true if viewerId==ownerId or is collaborator (query Collaborator collection)

 canApprove(ownerId, viewerId) true if collaborator relation exists (MVP: all collaborators can approve)

## 3) Open Banking Integration (GoCardless / Nordigen-style)

Important: implement provider behind an interface so you can swap later.

T3.1 — Provider interface

Create /server/openbanking/provider.ts:

createRequisition(userId): { requisitionId, consentLink }

getRequisition(requisitionId)

listAccounts(requisitionId): providerAccountIds[]

getTransactions(providerAccountId, dateFrom?): providerTx[]

T3.2 — GoCardless implementation (MVP)

 Token handling (if required)

 Create requisition + return redirect URL

 After user finishes consent, fetch accounts + transactions

T3.3 — DB persistence

 Store BankConnection (requisitionId, status)

 Upsert Accounts by providerAccountId (use findOneAndUpdate with upsert)

 Import Transactions with idempotency:

unique index on providerTransactionId

use findOneAndUpdate with upsert or check existence before insert

## 4) Transaction Normalization + Merchant Extraction
T4.1 — Normalize merchant name

Create utility:

normalizeMerchant(rawDescription: string): string
Rules:

lowercase

trim extra spaces

remove common noise (e.g., "card payment", "pos", "online", country codes)

keep it simple MVP

T4.2 — Store raw + normalized

On import:

 Save rawDescription

 Save merchantNameNormalized

## 5) Rules Engine (MVP)
T5.1 — Rules evaluation function

Create /server/rules/evaluate.ts:
Inputs:

transaction (Mongoose document)

all user rules (Mongoose documents)

budgets snapshot (spent per category)
Output:

updated flags

approvalRequired

approvalStatus (initial)

T5.2 — Rules logic (MVP)

Implement in this order (simple + deterministic):

Merchant blacklist:

if merchant matches any blacklist entry => isBlacklisted=true => status=VIOLATION (unless you prefer PENDING; your call)

Gambling:

if providerCategory indicates gambling OR merchant matches gambling list => isGambling=true => status=VIOLATION

Crypto:

if providerCategory indicates crypto OR merchant matches exchange list => isCrypto=true => status=VIOLATION

Approval threshold:

if amount >= threshold => approvalRequired=true => status=PENDING (unless already VIOLATION)

Budget exceed:

computedCategory spend > limit => isOverBudget=true => status=VIOLATION (unless you want PENDING)

MVP note

Keep category mapping minimal:

Start with computedCategory = providerCategory ?? "unknown"

Later add a manual override.

T5.3 — Apply rules after each sync

 After importing new transactions:

load rules + budgets

evaluate each new transaction

update row

## 6) Budgets (Strict)
T6.1 — Budget CRUD

 List budgets

 Create/update monthlyLimit

 Simple categories: Food, Shopping, Transport, Bills, Entertainment, Gambling, Crypto, Other

T6.2 — Monthly spend calculation

 For current month:

sum amounts grouped by computedCategory

 Determine remaining per category

T6.3 — Over-budget flagging

 In evaluate rules, if category exceeded:

set isOverBudget=true

set status=VIOLATION (unless already PENDING/VIOLATION)

## 7) Collaboration + Approvals
T7.1 — Invite collaborator

MVP simplest:

 Collaborator enters email

 If user exists: create Collaborator row

 If not: show “Ask them to sign up first” (fast path)

T7.2 — Collaborator views owner data

 A collaborator selects which “owner” they’re viewing (only if they collaborate with multiple)

T7.3 — Transaction approval

API (Express routes):

POST /api/transactions/:id/approve

POST /api/transactions/:id/deny
Rules:

Only owner or collaborator can act

Create Approval document in MongoDB

Update Transaction document (findByIdAndUpdate):

Approved => APPROVED

Denied => VIOLATION (or DENIED; but dashboard should treat as violation)

## 8) "Intent" Pre-Approval (MVP hack that works)
T8.1 — Intent CRUD

 Create intent:

amount, merchantText, category, note, expiresAt

status = PENDING

 List intents (pending first)

T8.2 — Intent approval

API (Express routes):

POST /api/intents/:id/approve

POST /api/intents/:id/deny

create Approval document in MongoDB

update Intent document (findByIdAndUpdate)

T8.3 — Matching engine (on transaction import)

When a new transaction arrives:

Find approved intents where:

now <= expiresAt

abs(tx.amount - intent.amount) <= tolerance (e.g., 200 cents)

tx.merchantNameNormalized contains normalize(intent.merchantText)

If matched:

Update Transaction document: matchedIntentId = intent._id

If intent APPROVED => approvalStatus = APPROVED (unless hard violation like gambling blacklist)

If intent DENIED => approvalStatus = VIOLATION

## 9) API Routes (Express)

Create Express server with routes in `/server/routes/`:

Auth / user

 GET /api/me

 POST /api/auth/login

 POST /api/auth/register

 POST /api/auth/logout

Banking

 POST /api/banking/requisition => returns consentLink

 GET /api/banking/callback?requisitionId=... => completes linking

 POST /api/banking/sync => sync accounts + transactions

Rules

 GET /api/rules

 PUT /api/rules/:id

 POST /api/rules/blacklist/add

 POST /api/rules/blacklist/remove

Budgets

 GET /api/budgets

 POST /api/budgets

 PUT /api/budgets/:id

Transactions

 GET /api/transactions?month=YYYY-MM

 POST /api/transactions/:id/approve

 POST /api/transactions/:id/deny

Intents

 GET /api/intents

 POST /api/intents

 POST /api/intents/:id/approve

 POST /api/intents/:id/deny

Collaborators

 GET /api/collaborators

 POST /api/collaborators/invite

Structure:
- `/server/index.ts` - Express app setup
- `/server/routes/` - Route handlers
- `/server/middleware/` - Auth middleware, error handling
- `/server/controllers/` - Business logic (optional, or keep in routes)

## 10) UI Screens (MVP)
T10.1 — Layout + Nav

 Sidebar: Dashboard, Transactions, Budgets, Rules, Intents, Collaborators, Settings

T10.2 — Connect Revolut flow

 Connect page with "Connect Revolut"

 Clicking calls backend API /api/banking/requisition and redirects to consentLink

 After redirect back: show "Connected" + Sync button

 Note: Frontend calls backend API (configure API base URL)

T10.3 — Dashboard (priority)

 KPI cards:

Total spend (month)

Violations (month)

Pending approvals

Gambling count, Crypto count

 Sections:

Pending approvals list (top)

Violations list (next)

T10.4 — Transactions page

 Table: date, merchant, amount, category, flags, status

 Filters: Pending, Violations, Gambling, Crypto, Blacklisted

 Transaction detail drawer: approval history + notes

T10.5 — Budgets page

 List categories with limit + spent + remaining

 Edit limit inline

T10.6 — Rules page

 Toggle gambling/crypto rule

 Approval threshold input

 Merchant blacklist editor (add/remove strings)

T10.7 — Intents page

 Create intent form

 Pending approvals list

 Approved intents list

T10.8 — Collaborators page

 Invite by email

 List collaborators

## 11) Notifications (Optional but high impact)
T11.1 — Email notifications (quick win)

 On new Pending approval => email collaborator

 On Violation => email owner + collaborator

(Keep optional; ship after core works.)

## 12) Background Sync (MVP)
T12.1 — Manual sync

 "Sync now" button calls backend API /api/banking/sync

T12.2 — Cron sync

 Add a cron endpoint /api/cron/sync (protected with secret header)

 Use node-cron or similar to schedule (e.g., every 6 hours)

 Or use external cron service (cron-job.org) to hit endpoint

Env:

CRON_SECRET=""

## 13) Testing (Minimal)
T13.1 — Unit tests for rule engine

 Merchant blacklist triggers violation

 Threshold triggers pending

 Intent match triggers approved

 Budget exceed triggers violation

T13.2 — Import idempotency test

 Same providerTransactionId does not duplicate (test unique index on MongoDB)

## 14) Deployment (Fast)
T14.1 — Choose platform

Frontend: Vercel for Next.js

Backend: Railway / Render / Fly.io / DigitalOcean App Platform

MongoDB: MongoDB Atlas (free tier) or self-hosted

T14.2 — Set env vars

Frontend:
- NEXT_PUBLIC_API_URL (backend URL)

Backend:
- MONGODB_URI
- OB provider secrets
- JWT_SECRET
- FRONTEND_URL (for CORS)
- CRON_SECRET

T14.3 — Setup production DB

 MongoDB Atlas: create cluster, get connection string

 No migrations needed (MongoDB is schema-less), but ensure indexes are created on first run

MVP Milestones (what “done” means)
Milestone A — “Connected + Visible”

Connect Revolut (via aggregator), import transactions, show table

Milestone B — “Strict”

Rules run and dashboard shows violations/pending

Milestone C — “Accountability”

Invite buddy + approvals work

Milestone D — “Pre-approval”

Intents + matching works

Implementation Notes / Guardrails

Treat open banking as read-only monitoring for MVP (soft blocks).

Keep rules deterministic; no ML.

Don’t overbuild category system: start with providerCategory + manual override later.

Ensure every Express API route enforces ownership/collaborator permissions.

Frontend and backend are separate: configure CORS properly, use environment variables for API URLs.
```
