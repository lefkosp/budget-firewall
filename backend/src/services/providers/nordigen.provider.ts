import { OpenBankingProvider, ProviderAccount, ProviderTransaction } from "../../types/openbanking";

export interface NordigenProviderConfig {
  secretId: string;
  secretKey: string;
  redirectUri: string;
  apiBaseUrl: string;
  institutionId: string;
}

interface NordigenTokenResponse {
  access: string;
  access_expires: number;
}

interface NordigenRequisitionResponse {
  id: string;
  link: string;
  status: string;
  accounts: string[];
}

interface NordigenAccountResponse {
  id: string;
  name?: string;
  iban?: string;
  currency?: string;
}

interface NordigenTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
}

interface NordigenTransactionsResponse {
  transactions?: { booked?: NordigenTransaction[] };
}

/**
 * Real GoCardless Bank Account Data API (formerly Nordigen) client. The
 * base URL and institution ID are config, not hardcoded -- there's no way
 * to verify these against a live sandbox until real credentials exist (see
 * DEVELOPMENT_PLAN.md Phase 5), so a drifted endpoint is a one-line env fix
 * rather than a code change. The HTTP client is injected so this class is
 * unit-testable without live credentials.
 */
export class NordigenProvider implements OpenBankingProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly providerConfig: NordigenProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await this.fetchImpl(`${this.providerConfig.apiBaseUrl}/token/new/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_id: this.providerConfig.secretId,
        secret_key: this.providerConfig.secretKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`Nordigen token request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as NordigenTokenResponse;
    this.accessToken = data.access;
    // Refresh a little early rather than racing the exact expiry instant.
    this.tokenExpiresAt = Date.now() + (data.access_expires - 30) * 1000;
    return this.accessToken;
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${this.providerConfig.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Nordigen ${method} ${path} failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  async createRequisition(
    userId: string,
    reference: string,
    institutionId?: string
  ): Promise<{ providerRequisitionId: string; consentLink: string }> {
    const requisition = await this.apiRequest<NordigenRequisitionResponse>("POST", "/requisitions/", {
      redirect: this.providerConfig.redirectUri,
      institution_id: institutionId || this.providerConfig.institutionId,
      reference,
      user_language: "EN",
    });

    return { providerRequisitionId: requisition.id, consentLink: requisition.link };
  }

  async getRequisition(providerRequisitionId: string): Promise<{ status: string }> {
    const requisition = await this.apiRequest<NordigenRequisitionResponse>(
      "GET",
      `/requisitions/${providerRequisitionId}/`
    );
    return { status: requisition.status };
  }

  async listAccounts(providerRequisitionId: string): Promise<ProviderAccount[]> {
    const requisition = await this.apiRequest<NordigenRequisitionResponse>(
      "GET",
      `/requisitions/${providerRequisitionId}/`
    );
    const accountIds = requisition.accounts || [];

    const accounts = await Promise.all(
      accountIds.map((accountId) => this.apiRequest<NordigenAccountResponse>("GET", `/accounts/${accountId}/`))
    );

    return accounts.map((account) => ({
      providerAccountId: account.id,
      name: account.name || account.iban || "Account",
      currency: account.currency || "EUR",
    }));
  }

  async getTransactions(providerAccountId: string, dateFrom?: Date): Promise<ProviderTransaction[]> {
    const dateFromStr = dateFrom ? dateFrom.toISOString().split("T")[0] : undefined;
    const query = dateFromStr ? `?date_from=${dateFromStr}` : "";

    const data = await this.apiRequest<NordigenTransactionsResponse>(
      "GET",
      `/accounts/${providerAccountId}/transactions/${query}`
    );

    const txList = data.transactions?.booked || [];

    return txList.map((tx) => ({
      // Nordigen's pending/near-booked transactions can lack transactionId.
      providerTransactionId: (tx.transactionId ?? tx.internalTransactionId) as string,
      bookedAt: new Date(tx.bookingDate || tx.valueDate || Date.now()),
      amount: Math.round(parseFloat(tx.transactionAmount?.amount || "0") * 100),
      currency: tx.transactionAmount?.currency || "EUR",
      rawDescription:
        tx.remittanceInformationUnstructured ||
        tx.remittanceInformationUnstructuredArray?.join(" ") ||
        "Unknown",
      providerCategory: undefined,
    }));
  }

  async deleteRequisition(providerRequisitionId: string): Promise<void> {
    await this.apiRequest("DELETE", `/requisitions/${providerRequisitionId}/`);
  }
}
