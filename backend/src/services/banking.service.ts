import { Types } from "mongoose";
import { BankConnection, BankConnectionStatus } from "../models/BankConnection";
import { Account } from "../models/Account";
import { OpenBankingProvider } from "../types/openbanking";
import { MockGoCardlessProvider } from "./providers/mock.provider";
import { NordigenProvider } from "./providers/nordigen.provider";
import { config } from "../config/env";
import { computeSyncFromDate } from "../utils/syncWindow";
import { syncAndProcessTransactions } from "./transaction.service";

// GoCardless/Nordigen consents run ~90 days; the mock provider has no real
// consent concept, so it synthesizes the same window for a fully
// exercisable UI without live credentials.
const CONSENT_VALID_DAYS = 90;

function buildProvider(): OpenBankingProvider {
  if (config.openBankingProvider === "nordigen") {
    if (!config.nordigenSecretId || !config.nordigenSecretKey || !config.nordigenRedirectUri) {
      throw new Error(
        "OPEN_BANKING_PROVIDER=nordigen requires NORDIGEN_SECRET_ID, NORDIGEN_SECRET_KEY, and NORDIGEN_REDIRECT_URI"
      );
    }
    return new NordigenProvider({
      secretId: config.nordigenSecretId,
      secretKey: config.nordigenSecretKey,
      redirectUri: config.nordigenRedirectUri,
      apiBaseUrl: config.nordigenApiBaseUrl,
      institutionId: config.nordigenInstitutionId,
    });
  }
  return new MockGoCardlessProvider();
}

const provider = buildProvider();

export { provider };

export async function createRequisition(userId: string): Promise<{ requisitionId: string; consentLink: string }> {
  const reference = `req_${userId}_${Date.now()}`;
  const { providerRequisitionId, consentLink } = await provider.createRequisition(userId, reference);

  await BankConnection.findOneAndUpdate(
    { requisitionId: reference },
    {
      ownerUserId: new Types.ObjectId(userId),
      requisitionId: reference,
      providerRequisitionId,
      status: BankConnectionStatus.CREATED,
      provider: config.openBankingProvider,
    },
    { upsert: true, new: true }
  );

  return { requisitionId: reference, consentLink };
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

  const consentExpiresAt = new Date(Date.now() + CONSENT_VALID_DAYS * 24 * 60 * 60 * 1000);

  await BankConnection.findOneAndUpdate(
    { requisitionId },
    { status: BankConnectionStatus.LINKED, consentExpiresAt }
  );

  // Fetch accounts via provider -- real provider needs its own requisition
  // ID, not our reference.
  const providerRequisitionId = bankConnection.providerRequisitionId || requisitionId;
  const accounts = await provider.listAccounts(providerRequisitionId);

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

export interface SyncResult {
  accountsSynced: number;
  transactionsImported: number;
  transactionsNew: number;
}

/**
 * Syncs every account for a user, each from its own cursor (see
 * utils/syncWindow.ts) rather than a fixed lookback. Shared by the
 * user-triggered /api/banking/sync route and the background cron sweep
 * (routes/cron.ts) so the two don't duplicate this loop.
 */
export async function syncAccountsForConnection(userId: string): Promise<SyncResult> {
  const accounts = await Account.find({ ownerUserId: new Types.ObjectId(userId) });

  let transactionsImported = 0;
  let transactionsNew = 0;

  for (const account of accounts) {
    const dateFrom = computeSyncFromDate(account.lastSyncedAt, new Date());
    const providerTransactions = await provider.getTransactions(account.providerAccountId, dateFrom);

    // Bank syncs (unlike CSV re-imports) also fuzzy-reconcile against
    // previously CSV-imported history -- see utils/reconcile.ts.
    const newTransactions = await syncAndProcessTransactions(
      userId,
      account._id.toString(),
      providerTransactions,
      { enableFuzzyDedupe: true }
    );

    transactionsImported += providerTransactions.length;
    transactionsNew += newTransactions.length;

    account.lastSyncedAt = new Date();
    await account.save();
  }

  return { accountsSynced: accounts.length, transactionsImported, transactionsNew };
}
