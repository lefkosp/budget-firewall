import { OpenBankingProvider } from "./provider";

/**
 * Mock GoCardless provider for MVP testing.
 * Returns realistic Revolut-style transaction data without requiring real API keys.
 */
export class MockGoCardlessProvider implements OpenBankingProvider {
  async createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }> {
    // Generate a mock requisition ID
    const requisitionId = `mock_req_${userId}_${Date.now()}`;
    
    // For MVP, we'll simulate the consent flow by returning a mock link
    // In production, this would redirect to GoCardless consent page
    // Note: This will be handled by the Express backend callback route
    const consentLink = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/banking/callback?requisitionId=${requisitionId}&mock=true`;
    
    return { requisitionId, consentLink };
  }

  async getRequisition(requisitionId: string): Promise<{ status: string }> {
    // Mock: assume all requisitions are linked after callback
    return { status: "LINKED" };
  }

  async listAccounts(requisitionId: string): Promise<Array<{ providerAccountId: string; name: string; currency: string }>> {
    // Return mock Revolut account
    return [
      {
        providerAccountId: `mock_account_${requisitionId}`,
        name: "Revolut EUR Account",
        currency: "EUR",
      },
    ];
  }

  async getTransactions(
    providerAccountId: string,
    dateFrom?: Date
  ): Promise<Array<{
    providerTransactionId: string;
    bookedAt: Date;
    amount: number;
    currency: string;
    rawDescription: string;
    providerCategory?: string;
  }>> {
    // Generate realistic mock transactions for testing
    const now = new Date();
    const fromDate = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
    
    const mockTransactions = [
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_1`,
        bookedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        amount: -2500, // -€25.00
        currency: "EUR",
        rawDescription: "CARD PAYMENT TO AMAZON EU S.A.R.L., LUXEMBOURG",
        providerCategory: "Shopping",
      },
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_2`,
        bookedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        amount: -1200, // -€12.00
        currency: "EUR",
        rawDescription: "POS PAYMENT TO STARBUCKS COFFEE, DUBLIN",
        providerCategory: "Food",
      },
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_3`,
        bookedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        amount: -6000, // -€60.00 (above threshold)
        currency: "EUR",
        rawDescription: "ONLINE PAYMENT TO BET365.COM, MALTA",
        providerCategory: "Gambling",
      },
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_4`,
        bookedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        amount: -50000, // -€500.00 (large amount)
        currency: "EUR",
        rawDescription: "CARD PAYMENT TO BINANCE, MALTA",
        providerCategory: "Crypto",
      },
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_5`,
        bookedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        amount: -3500, // -€35.00
        currency: "EUR",
        rawDescription: "POS PAYMENT TO TESCO STORES, DUBLIN",
        providerCategory: "Shopping",
      },
      {
        providerTransactionId: `tx_${providerAccountId}_${Date.now()}_6`,
        bookedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        amount: -800, // -€8.00
        currency: "EUR",
        rawDescription: "CARD PAYMENT TO UBER EATS, DUBLIN",
        providerCategory: "Food",
      },
    ];

    // Filter by dateFrom if provided
    return mockTransactions.filter((tx) => tx.bookedAt >= fromDate);
  }
}

// Export singleton instance
export const mockGoCardlessProvider = new MockGoCardlessProvider();

