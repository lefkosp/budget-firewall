import { describe, it, expect, vi, beforeEach } from "vitest";
import { NordigenProvider } from "./nordigen.provider";

const config = {
  secretId: "test-secret-id",
  secretKey: "test-secret-key",
  redirectUri: "http://localhost:3001/api/banking/callback",
  apiBaseUrl: "https://bankaccountdata.gocardless.com/api/v2",
  institutionId: "REVOLUT_REVOGB21",
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("NordigenProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("fetches an access token before the first API call, and reuses it on the next call", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access: "token-1", access_expires: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: "req-1", link: "https://gocardless.example/consent", status: "CR", accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "req-1", link: "https://gocardless.example/consent", status: "CR", accounts: [] }));

    const provider = new NordigenProvider(config, fetchMock as unknown as typeof fetch);
    await provider.createRequisition("user-1", "ref-1");
    await provider.getRequisition("req-1");

    // 3 calls total: one token fetch, two API calls -- the token is not re-fetched.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/token/new/"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("sends our reference and the redirect URI when creating a requisition", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access: "token-1", access_expires: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: "provider-req-id", link: "https://gocardless.example/consent", status: "CR", accounts: [] }));

    const provider = new NordigenProvider(config, fetchMock as unknown as typeof fetch);
    const result = await provider.createRequisition("user-1", "our-reference-123");

    expect(result).toEqual({ providerRequisitionId: "provider-req-id", consentLink: "https://gocardless.example/consent" });

    const [, requestInit] = fetchMock.mock.calls[1];
    const body = JSON.parse(requestInit.body);
    expect(body.reference).toBe("our-reference-123");
    expect(body.redirect).toBe(config.redirectUri);
    expect(body.institution_id).toBe(config.institutionId);
  });

  it("resolves each account ID on a requisition into a listed account", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access: "token-1", access_expires: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: "req-1", link: "x", status: "LN", accounts: ["acc-1", "acc-2"] }))
      .mockResolvedValueOnce(jsonResponse({ id: "acc-1", iban: "IE00BANK", currency: "EUR" }))
      .mockResolvedValueOnce(jsonResponse({ id: "acc-2", name: "Savings", currency: "EUR" }));

    const provider = new NordigenProvider(config, fetchMock as unknown as typeof fetch);
    const accounts = await provider.listAccounts("req-1");

    expect(accounts).toEqual([
      { providerAccountId: "acc-1", name: "IE00BANK", currency: "EUR" },
      { providerAccountId: "acc-2", name: "Savings", currency: "EUR" },
    ]);
  });

  it("converts transaction amounts to integer cents and falls back to internalTransactionId", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access: "token-1", access_expires: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: {
            booked: [
              {
                transactionId: "tx-1",
                bookingDate: "2026-01-15",
                transactionAmount: { amount: "-12.50", currency: "EUR" },
                remittanceInformationUnstructured: "TESCO STORES",
              },
              {
                internalTransactionId: "internal-tx-2",
                bookingDate: "2026-01-16",
                transactionAmount: { amount: "3.33", currency: "EUR" },
                remittanceInformationUnstructuredArray: ["SALARY", "PAYMENT"],
              },
            ],
          },
        })
      );

    const provider = new NordigenProvider(config, fetchMock as unknown as typeof fetch);
    const transactions = await provider.getTransactions("acc-1");

    expect(transactions[0]).toMatchObject({
      providerTransactionId: "tx-1",
      amount: -1250,
      currency: "EUR",
      rawDescription: "TESCO STORES",
    });
    expect(transactions[1]).toMatchObject({
      providerTransactionId: "internal-tx-2",
      amount: 333,
      rawDescription: "SALARY PAYMENT",
    });
  });

  it("throws with the response status when the API call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access: "token-1", access_expires: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ detail: "not found" }, false, 404));

    const provider = new NordigenProvider(config, fetchMock as unknown as typeof fetch);
    await expect(provider.getRequisition("missing-req")).rejects.toThrow(/404/);
  });
});
