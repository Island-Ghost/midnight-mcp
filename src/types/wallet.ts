/**
 * Shared wallet types used across wallet and MCP modules
 */

/**
 * Wallet balance types breakdown with values represented as dust strings
 */
export interface WalletBalances {
  // Total balance from the balances map (definitive and spendable excluding zero balances)
  totalBalance: string;
  // Immediately available coins that can be spent right now
  availableBalance: string;
  // Coins that are pending and not yet available for spending
  pendingBalance: string;
  // All coins including both available and pending
  allCoinsBalance: string;
}

/**
 * Wallet sync progress information
 */
export interface WalletSyncProgress {
  synced: bigint;
  total: bigint;
  percentage: number;
}

/**
 * Comprehensive wallet status information
 */
export interface WalletStatus {
  ready: boolean;
  syncing: boolean;
  syncProgress: WalletSyncProgress;
  address: string;
  balances: WalletBalances;
  recovering: boolean;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  isFullySynced: boolean;
}

/**
 * Transaction verification result
 */
export interface TransactionVerificationResult {
  exists: boolean;
  syncStatus: {
    syncedIndices: bigint;
    totalIndices: bigint;
    isFullySynced: boolean;
  }
}

/**
 * Send funds operation result
 */
export interface SendFundsResult {
  txIdentifier: string;
  syncStatus: {
    syncedIndices: bigint;
    totalIndices: bigint;
    isFullySynced: boolean;
  }
  amount: string; // Amount sent in dust format
} 