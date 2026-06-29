export interface OpenBankingProvider {
  createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }>;
  getRequisition(requisitionId: string): Promise<{ status: string }>;
  listAccounts(requisitionId: string): Promise<Array<{ providerAccountId: string; name: string; currency: string }>>;
  getTransactions(
    providerAccountId: string,
    dateFrom?: Date
  ): Promise<Array<{
    providerTransactionId: string;
    bookedAt: Date;
    amount: number; // in cents
    currency: string;
    rawDescription: string;
    providerCategory?: string;
  }>>;
}

