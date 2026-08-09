export interface ProviderTransaction {
  providerTransactionId: string;
  bookedAt: Date;
  amount: number;
  currency: string;
  rawDescription: string;
  providerCategory?: string;
}

export interface ProviderAccount {
  providerAccountId: string;
  name: string;
  currency: string;
}

/**
 * A bank-data provider (GoCardless/Nordigen in production, a mock in local
 * dev). `reference` is OUR caller-supplied identifier, used as the app's own
 * lookup key (stored as `BankConnection.requisitionId`) and echoed back by
 * GoCardless's OAuth redirect as `?ref=`. `providerRequisitionId` is the
 * PROVIDER's own identifier for that same consent, needed for every
 * subsequent call to their API -- the two are stored as separate fields on
 * `BankConnection` because they're never the same value for a real provider.
 */
export interface OpenBankingProvider {
  createRequisition(
    userId: string,
    reference: string,
    institutionId?: string
  ): Promise<{ providerRequisitionId: string; consentLink: string }>;
  getRequisition(providerRequisitionId: string): Promise<{ status: string }>;
  listAccounts(providerRequisitionId: string): Promise<ProviderAccount[]>;
  getTransactions(providerAccountId: string, dateFrom?: Date): Promise<ProviderTransaction[]>;
  deleteRequisition(providerRequisitionId: string): Promise<void>;
}
