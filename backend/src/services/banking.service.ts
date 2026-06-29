import { Types } from "mongoose";
import { BankConnection, BankConnectionStatus } from "../models/BankConnection";
import { Account } from "../models/Account";

// Mock provider interface - in production, this would be the real GoCardless provider
interface OpenBankingProvider {
  createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }>;
  getRequisition(requisitionId: string): Promise<{ status: string }>;
  listAccounts(requisitionId: string): Promise<Array<{ providerAccountId: string; name: string; currency: string }>>;
  getTransactions(
    providerAccountId: string,
    dateFrom?: Date
  ): Promise<Array<{
    providerTransactionId: string;
    bookedAt: Date;
    amount: number;
    currency: string;
    rawDescription: string;
    providerCategory?: string;
  }>>;
}

// Mock GoCardless provider implementation
class MockGoCardlessProvider implements OpenBankingProvider {
  async createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }> {
    const requisitionId = `mock_req_${userId}_${Date.now()}`;
    const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL?.replace("3000", "3001") || "http://localhost:3001";
    const consentLink = `${backendUrl}/api/banking/callback?requisitionId=${requisitionId}&mock=true`;
    return { requisitionId, consentLink };
  }

  async getRequisition(requisitionId: string): Promise<{ status: string }> {
    return { status: "LINKED" };
  }

  async listAccounts(requisitionId: string): Promise<Array<{ providerAccountId: string; name: string; currency: string }>> {
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
    const now = new Date();
    const fromDate = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Generate realistic transactions for the past 30 days
    const merchants = [
      { name: "AMAZON EU S.A.R.L.", category: "Shopping", amounts: [-2500, -4500, -8900, -12000, -3500] },
      { name: "STARBUCKS COFFEE", category: "Food", amounts: [-450, -650, -550, -750, -850] },
      { name: "TESCO STORES", category: "Shopping", amounts: [-3500, -4200, -2800, -5100, -3900] },
      { name: "UBER EATS", category: "Food", amounts: [-1800, -2400, -3200, -1500, -2100] },
      { name: "SPOTIFY", category: "Entertainment", amounts: [-999] },
      { name: "NETFLIX", category: "Entertainment", amounts: [-1299] },
      { name: "APPLE.COM/BILL", category: "Bills", amounts: [-999, -1999] },
      { name: "SHELL SERVICE STATION", category: "Transport", amounts: [-4500, -5200, -3800] },
      { name: "RYANAIR", category: "Transport", amounts: [-8900, -12500] },
      { name: "BOOKING.COM", category: "Entertainment", amounts: [-12500, -18900] },
      { name: "DELIVEROO", category: "Food", amounts: [-2200, -2800, -1900] },
      { name: "PRIMARK", category: "Shopping", amounts: [-1500, -2300, -1800] },
      { name: "DUNNES STORES", category: "Shopping", amounts: [-3200, -4100, -2900] },
      { name: "LIDL", category: "Shopping", amounts: [-2800, -3500, -2400] },
      { name: "ALDI", category: "Shopping", amounts: [-2600, -3100, -2200] },
      { name: "BET365.COM", category: "Gambling", amounts: [-6000, -8500, -12000] },
      { name: "BINANCE", category: "Crypto", amounts: [-50000, -75000, -30000] },
      { name: "COINBASE", category: "Crypto", amounts: [-25000, -40000] },
      { name: "PAYPAL", category: "Shopping", amounts: [-1500, -3200, -4500] },
      { name: "REVOLUT", category: "Bills", amounts: [-999] },
      { name: "VODAFONE IRELAND", category: "Bills", amounts: [-3500] },
      { name: "EIR", category: "Bills", amounts: [-4500] },
      { name: "ESB ELECTRIC IRELAND", category: "Bills", amounts: [-8500] },
      { name: "GAS NETWORKS IRELAND", category: "Bills", amounts: [-6500] },
      { name: "CINEWORLD", category: "Entertainment", amounts: [-1200, -1800] },
      { name: "JUST EAT", category: "Food", amounts: [-1900, -2500, -1600] },
      { name: "DOMINO'S PIZZA", category: "Food", amounts: [-2200, -2800] },
      { name: "MCDONALD'S", category: "Food", amounts: [-850, -1200, -950] },
      { name: "SUPERVALU", category: "Shopping", amounts: [-4200, -5100, -3800] },
      { name: "MARKS & SPENCER", category: "Shopping", amounts: [-3500, -4800] },
    ];

    const mockTransactions: Array<{
      providerTransactionId: string;
      bookedAt: Date;
      amount: number;
      currency: string;
      rawDescription: string;
      providerCategory?: string;
    }> = [];

    // Generate transactions for the past 30 days
    for (let day = 0; day < 30; day++) {
      const transactionDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
      
      // Skip weekends occasionally (70% chance of transaction on weekdays, 40% on weekends)
      const isWeekend = transactionDate.getDay() === 0 || transactionDate.getDay() === 6;
      if (isWeekend && Math.random() > 0.4) continue;
      if (!isWeekend && Math.random() > 0.7) continue;

      // Random number of transactions per day (0-3)
      const transactionsPerDay = Math.floor(Math.random() * 4);
      
      for (let i = 0; i < transactionsPerDay; i++) {
        const merchant = merchants[Math.floor(Math.random() * merchants.length)];
        const amount = merchant.amounts[Math.floor(Math.random() * merchant.amounts.length)];
        
        // Add some randomness to the time of day
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        const transactionTime = new Date(transactionDate);
        transactionTime.setHours(hour, minute, 0, 0);

        mockTransactions.push({
          providerTransactionId: `tx_${providerAccountId}_${transactionTime.getTime()}_${i}`,
          bookedAt: transactionTime,
          amount,
          currency: "EUR",
          rawDescription: `CARD PAYMENT TO ${merchant.name}, DUBLIN`,
          providerCategory: merchant.category,
        });
      }
    }

    // Sort by date (newest first)
    mockTransactions.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime());

    return mockTransactions.filter((tx) => tx.bookedAt >= fromDate);
  }
}

const provider = new MockGoCardlessProvider();

export { provider };

export async function createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }> {
  const { requisitionId, consentLink } = await provider.createRequisition(userId);

  await BankConnection.findOneAndUpdate(
    { requisitionId },
    {
      ownerUserId: new Types.ObjectId(userId),
      requisitionId,
      status: BankConnectionStatus.CREATED,
      provider: "gocardless",
    },
    { upsert: true, new: true }
  );

  return { requisitionId, consentLink };
}

export async function handleCallback(userId: string, requisitionId: string): Promise<number> {
  // Verify the requisition belongs to this user
  const bankConnection = await BankConnection.findOne({
    requisitionId,
    ownerUserId: new Types.ObjectId(userId),
  });

  if (!bankConnection) {
    throw new Error("Invalid requisition");
  }

  // Update status to LINKED
  await BankConnection.findOneAndUpdate(
    { requisitionId },
    { status: BankConnectionStatus.LINKED }
  );

  // Fetch accounts via provider
  const accounts = await provider.listAccounts(requisitionId);

  // Upsert accounts
  let accountsCreated = 0;
  for (const account of accounts) {
    await Account.findOneAndUpdate(
      { providerAccountId: account.providerAccountId },
      {
        ownerUserId: new Types.ObjectId(userId),
        providerAccountId: account.providerAccountId,
        name: account.name,
        currency: account.currency,
      },
      { upsert: true, new: true }
    );
    accountsCreated++;
  }

  return accountsCreated;
}

export async function syncTransactions(userId: string): Promise<{ imported: number; new: number }> {
  const accounts = await Account.find({ ownerUserId: new Types.ObjectId(userId) });

  if (accounts.length === 0) {
    throw new Error("No accounts found");
  }

  let totalImported = 0;
  let totalNew = 0;

  for (const account of accounts) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);

    const providerTransactions = await provider.getTransactions(
      account.providerAccountId,
      dateFrom
    );

    for (const providerTx of providerTransactions) {
      // Check if transaction already exists
      const existing = await require("../models/Transaction").Transaction.findOne({
        providerTransactionId: providerTx.providerTransactionId,
      });

      if (!existing) {
        // Will be created by transaction service
        totalNew++;
      }
      totalImported++;
    }
  }

  return { imported: totalImported, new: totalNew };
}

