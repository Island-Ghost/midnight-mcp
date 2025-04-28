/**
 * Shared wallet types used across wallet and MCP modules
 */

/**
 * Wallet balance types breakdown
 */
export interface WalletBalances {
  // Total balance from the balances map (definitive and spendable excluding zero balances)
  totalBalance: bigint;
  // Immediately available coins that can be spent right now
  availableBalance: bigint;
  // Coins that are pending and not yet available for spending
  pendingBalance: bigint;
  // All coins including both available and pending
  allCoinsBalance: bigint;
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
  txHash: string;
  syncStatus: {
    syncedIndices: bigint;
    totalIndices: bigint;
    isFullySynced: boolean;
  }
} 