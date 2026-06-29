# Migration from Mock to Real Open Banking (GoCardless)

## What You Need to Do

### 1. Sign Up for GoCardless Bank Account Data API

1. **Create a GoCardless account**

   - Go to https://bankaccountdata.gocardless.com/
   - Sign up for an account
   - Choose the appropriate plan (they have a sandbox for testing)

2. **Get API Credentials**

   - Navigate to your GoCardless dashboard
   - Go to "API" or "Credentials" section
   - You'll need:
     - **Secret ID** (also called Client ID)
     - **Secret Key** (also called Client Secret)

3. **Set Up Redirect URI**
   - In your GoCardless dashboard, configure the redirect URI:
     - For development: `http://localhost:3001/api/banking/callback`
     - For production: `https://yourdomain.com/api/banking/callback`
   - This is where GoCardless will redirect users after they authorize access

### 2. Environment Variables

Add these to your `backend/.env` file:

```env
# Nordigen API Credentials
NORDIGEN_SECRET_ID=your_secret_id_here
NORDIGEN_SECRET_KEY=your_secret_key_here

# Redirect URI (must match what you configured in Nordigen dashboard)
NORDIGEN_REDIRECT_URI=http://localhost:3001/api/banking/callback

# Provider selection (nordigen, truelayer, plaid, or mock)
OPEN_BANKING_PROVIDER=nordigen
```

### 3. Install Nordigen SDK

```bash
cd backend
npm install nordigen-node
```

Or use the REST API directly (no SDK needed):

```bash
npm install axios  # if not already installed
```

## Code Changes Needed

### Step 1: Create Real Nordigen Provider

Create `backend/src/services/providers/nordigen.provider.ts`:

```typescript
import axios from "axios";
import { OpenBankingProvider } from "../../types/openbanking";

interface NordigenTokenResponse {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

export class NordigenProvider implements OpenBankingProvider {
  private secretId: string;
  private secretKey: string;
  private redirectUri: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.secretId = process.env.NORDIGEN_SECRET_ID || "";
    this.secretKey = process.env.NORDIGEN_SECRET_KEY || "";
    this.redirectUri = process.env.NORDIGEN_REDIRECT_URI || "";

    if (!this.secretId || !this.secretKey) {
      throw new Error("Nordigen credentials not configured");
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Get new token
    const response = await axios.post<NordigenTokenResponse>(
      "https://ob.nordigen.com/api/v2/token/new/",
      {
        secret_id: this.secretId,
        secret_key: this.secretKey,
      }
    );

    this.accessToken = response.data.access;
    this.tokenExpiresAt = Date.now() + response.data.access_expires * 1000;

    return this.accessToken;
  }

  private async apiRequest(method: string, endpoint: string, data?: any) {
    const token = await this.getAccessToken();
    const response = await axios({
      method,
      url: `https://ob.nordigen.com/api/v2${endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data,
    });
    return response.data;
  }

  async createRequisition(
    userId: string,
    institutionId: string = "REVOLUT_REVOGB21" // Revolut institution ID
  ): Promise<{ requisitionId: string; consentLink: string }> {
    if (!this.redirectUri) {
      throw new Error("NORDIGEN_REDIRECT_URI not configured");
    }

    const requisition = await this.apiRequest("POST", "/requisitions/", {
      redirect: this.redirectUri,
      institution_id: institutionId,
      reference: `user_${userId}_${Date.now()}`,
      user_language: "EN",
    });

    return {
      requisitionId: requisition.id,
      consentLink: requisition.link,
    };
  }

  async getRequisition(requisitionId: string): Promise<{ status: string }> {
    const requisition = await this.apiRequest(
      "GET",
      `/requisitions/${requisitionId}/`
    );
    return { status: requisition.status };
  }

  async listAccounts(
    requisitionId: string
  ): Promise<
    Array<{ providerAccountId: string; name: string; currency: string }>
  > {
    const requisition = await this.apiRequest(
      "GET",
      `/requisitions/${requisitionId}/`
    );
    const accountIds = requisition.accounts || [];

    const accounts = await Promise.all(
      accountIds.map((accountId: string) =>
        this.apiRequest("GET", `/accounts/${accountId}/`)
      )
    );

    return accounts.map((account: any) => ({
      providerAccountId: account.id,
      name: account.name || account.iban || "Account",
      currency: account.currency || "EUR",
    }));
  }

  async getTransactions(
    providerAccountId: string,
    dateFrom?: Date
  ): Promise<
    Array<{
      providerTransactionId: string;
      bookedAt: Date;
      amount: number;
      currency: string;
      rawDescription: string;
      providerCategory?: string;
    }>
  > {
    const dateFromStr = dateFrom
      ? dateFrom.toISOString().split("T")[0]
      : undefined;

    const transactions = await this.apiRequest(
      "GET",
      `/accounts/${providerAccountId}/transactions/`,
      dateFromStr ? { date_from: dateFromStr } : undefined
    );

    const txList = transactions.transactions?.booked || [];

    return txList.map((tx: any) => ({
      providerTransactionId: tx.transactionId || tx.internalTransactionId,
      bookedAt: new Date(tx.bookingDate || tx.valueDate),
      amount: Math.round(parseFloat(tx.transactionAmount?.amount || "0") * 100), // Convert to cents
      currency: tx.transactionAmount?.currency || "EUR",
      rawDescription:
        tx.remittanceInformationUnstructured ||
        tx.remittanceInformationUnstructuredArray?.join(" ") ||
        "Unknown",
      providerCategory: undefined, // Nordigen doesn't provide categories
    }));
  }
}
```

### Step 2: Update Banking Service

Modify `backend/src/services/banking.service.ts` to use the real provider:

```typescript
import { NordigenProvider } from "./providers/nordigen.provider";
import { MockGoCardlessProvider } from "./providers/mock.provider";

// Use real provider if credentials are configured, otherwise use mock
const providerType = process.env.OPEN_BANKING_PROVIDER || "mock";
const provider =
  providerType === "nordigen" && process.env.NORDIGEN_SECRET_ID
    ? new NordigenProvider()
    : new MockGoCardlessProvider();

export { provider };
```

### Step 3: Update Callback Route

The callback route needs to handle the real OAuth flow. Nordigen redirects back with the requisition ID in the query string:

```typescript
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { ref, mock } = req.query; // Nordigen uses 'ref', mock uses 'requisitionId'
    const requisitionId = (ref || req.query.requisitionId) as string;

    if (!requisitionId) {
      return res.status(400).json({ error: "Missing requisition ID" });
    }

    const isMock = mock === "true";

    if (isMock) {
      // Mock flow (existing code)
      const bankConnection = await BankConnection.findOne({ requisitionId });
      if (!bankConnection) {
        return res.status(404).json({ error: "Invalid requisition" });
      }
      const userId = bankConnection.ownerUserId.toString();
      const accountsCount = await handleCallback(userId, requisitionId);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      return res.redirect(`${frontendUrl}/connect?linked=true`);
    }

    // Real Nordigen flow
    // Look up the requisition to get the userId
    const bankConnection = await BankConnection.findOne({ requisitionId });
    if (!bankConnection) {
      return res.status(404).json({ error: "Invalid requisition" });
    }

    // Verify requisition status with Nordigen
    const requisitionStatus = await provider.getRequisition(requisitionId);

    // Nordigen statuses: "LN" = Linked, "CR" = Created, "EX" = Expired, "RJ" = Rejected
    if (requisitionStatus.status !== "LN") {
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/connect?error=not_authorized`
      );
    }

    const userId = bankConnection.ownerUserId.toString();
    const accountsCount = await handleCallback(userId, requisitionId);

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(`${frontendUrl}/connect?linked=true`);
  } catch (error: any) {
    console.error("Callback error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(
      `${frontendUrl}/connect?error=${encodeURIComponent(error.message)}`
    );
  }
});
```

### Step 4: Move Mock Provider to Separate File

Create `backend/src/services/providers/mock.provider.ts` and move the MockGoCardlessProvider class there.

## Testing Checklist

1. ✅ Set up GoCardless sandbox account
2. ✅ Configure environment variables
3. ✅ Install GoCardless SDK
4. ✅ Test requisition creation
5. ✅ Test OAuth redirect flow
6. ✅ Test account listing
7. ✅ Test transaction syncing
8. ✅ Verify error handling

## Important Notes

- **Sandbox vs Production**: Start with sandbox for testing
- **Institution IDs**: You'll need Revolut's institution ID (usually `REVOLUT_REVOGB21`)
- **Rate Limits**: GoCardless has rate limits - implement retry logic if needed
- **Error Handling**: Real API calls can fail - add proper error handling
- **Webhooks**: Consider implementing webhooks for real-time transaction updates (optional for MVP)

## Nordigen Documentation

- API Docs: https://ob.nordigen.com/api-docs/
- Institution IDs: https://ob.nordigen.com/api/v2/institutions/?country=GB (or your country)
- Revolut ID: Usually `REVOLUT_REVOGB21` (check the institutions endpoint)
- Quick Start: https://nordigen.com/en/account_information_documentation/integration/quickstart_guide/

## Alternative Provider Resources

### TrueLayer

- Docs: https://docs.truelayer.com/
- Revolut Support: Yes (via UK Open Banking)

### Plaid

- Docs: https://plaid.com/docs/
- Note: Primarily US-focused, limited European coverage

### Tink

- Docs: https://docs.tink.com/
- Revolut Support: Yes (European coverage)
