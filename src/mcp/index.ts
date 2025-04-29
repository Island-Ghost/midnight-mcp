import { WalletManager, WalletConfig } from '../wallet/index.js';
import { setNetworkId, NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { createLogger } from '../logger/index.js';
import type { Logger } from 'pino';
import { 
  WalletStatus, 
  WalletBalances, 
  SendFundsResult as WalletSendFundsResult,
  TransactionVerificationResult,  
  SendFundsProcessingResult
} from '../types/wallet.js';

/**
 * Error types for the MCP API
 */
export enum MCPErrorType {
  WALLET_NOT_READY = 'WALLET_NOT_READY',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TX_SUBMISSION_FAILED = 'TX_SUBMISSION_FAILED',
  TX_NOT_FOUND = 'TX_NOT_FOUND',
  IDENTIFIER_VERIFICATION_FAILED = 'IDENTIFIER_VERIFICATION_FAILED',
}

/**
 * Centralized error message mapping for MCP error types
 */
export const ERROR_MESSAGES = {
  [MCPErrorType.WALLET_NOT_READY]: 'Wallet is not ready yet. Please try again later.',
  [MCPErrorType.INSUFFICIENT_FUNDS]: 'Insufficient funds for this transaction.',
  [MCPErrorType.TX_SUBMISSION_FAILED]: 'Transaction submission failed.',
  [MCPErrorType.TX_NOT_FOUND]: 'Transaction not found.',
  [MCPErrorType.IDENTIFIER_VERIFICATION_FAILED]: 'Transaction verification failed.',
};

/**
 * Error class for MCP errors
 */
export class MCPError extends Error {
  constructor(public type: MCPErrorType, message: string) {
    super(message);
    this.name = 'MCPError';
  }
}

/**
 * Generic error handler for MCP errors
 * @param error The error to handle
 * @returns A formatted response with appropriate error message
 */
export function handleMCPError(error: unknown) {
  if (error instanceof MCPError) {
    const message = ERROR_MESSAGES[error.type] || error.message || 'An unexpected error occurred.';
    return { 
      content: [{ 
        type: "text" as const, 
        text: message 
      }] 
    };
  }
  
  // For non-MCP errors, rethrow to be caught by the outer handler
  throw error;
}

/**
 * Higher-order function for tool handlers without parameters
 * @param handler The function to wrap
 * @returns A wrapped function that handles errors
 */
export function createSimpleToolHandler(handler: () => any) {
  return async () => {
    try {
      const result = await handler();
      return { 
        content: [{ 
          type: "text" as const, 
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) 
        }] 
      };
    } catch (error: unknown) {
      return handleMCPError(error);
    }
  };
}

/**
 * Higher-order function for tool handlers with parameters
 * @param handler The function to wrap
 * @returns A wrapped function that handles errors
 */
export function createParameterizedToolHandler<T extends Record<string, any>>(handler: (args: T) => any) {
  return async (args: T) => {
    try {
      const result = await handler(args);
      return { 
        content: [{ 
          type: "text" as const, 
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) 
        }] 
      };
    } catch (error: unknown) {
      return handleMCPError(error);
    }
  };
}

/**
 * Transaction status type for notifications
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

/**
 * Transaction notification payload
 */
export interface TransactionNotification {
  txIdentifier: string;
  status: TransactionStatus;
  message: string;
  amount?: string;
  destinationAddress?: string;
  error?: string;
}

/**
 * MCP Server that provides a secure interface to interact with the Midnight blockchain
 * through the wallet implementation
 */
export class MCPServer {
  private wallet: WalletManager;
  private logger: Logger;
  private notificationHandler: ((notification: TransactionNotification) => void) | undefined;
  /**
   * Create a new MCP Server instance
   * @param networkId The Midnight network ID to connect to
   * @param seed The seed for the wallet
   * @param walletFilename filename to restore wallet from
   * @param externalConfig Optional external configuration for connecting to a proof server
   */
  constructor(networkId: NetworkId, seed: string, walletFilename: string, externalConfig?: WalletConfig) {
    // Set network ID if provided
    if (networkId) {
      setNetworkId(networkId);
    }
    
    this.logger = createLogger('mcp-server');
    
    this.logger.info('Initializing Midnight MCP Server');
    
    // Initialize WalletManager with network ID, seed, filename, and optional external config
    this.wallet = new WalletManager(networkId, seed, walletFilename, externalConfig);
    
    this.logger.info('MCP Server initialized, wallet synchronization started in background');
  }
  
  /**
   * Check if the wallet is ready for operations
   * @returns true if wallet is synced and ready
   */
  public isReady(): boolean {
    // Pass false to ensure we get a boolean back from the wallet manager
    return this.wallet.isReady(false) as boolean;
  }
  
  /**
   * Get the wallet's address
   * @returns The wallet address as a string
   * @throws MCPError if wallet is not ready
   */
  public getAddress(): string {
    try {
      return this.wallet.getAddress();
    } catch (error) {
      this.logger.error('Error getting wallet address', error);
      throw new MCPError(MCPErrorType.WALLET_NOT_READY, 'Error accessing wallet address');
    }
  }
  
  /**
   * Get the wallet's current balance
   * @returns The wallet balance details as strings
   * @throws MCPError if wallet is not ready
   */
  public getBalance(): WalletBalances {
    if (!this.isReady()) {
      throw new MCPError(MCPErrorType.WALLET_NOT_READY, 'Wallet is not ready');
    }
    
    try {
      return this.wallet.getBalance();
    } catch (error) {
      this.logger.error('Error getting wallet balance', error);
      throw new MCPError(MCPErrorType.WALLET_NOT_READY, 'Error accessing wallet balance');
    }
  }
  
  /**
   * Validates parameters for sending funds without actually sending them
   * @param destinationAddress Address to send the funds to
   * @param amount Amount of funds to send as a string (decimal value)
   * @throws Error if parameters are invalid
   */
  private async validateSendFundsParams(destinationAddress: string, amount: string): Promise<void> {
    if (!destinationAddress || !amount) {
      throw new Error('Destination address and amount are required');
    }
    
    // Check if the amount is a valid number
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    // Check if we have enough balance (if wallet provides this method)
    const balances = this.getBalance();
    if (amountValue > parseFloat(balances.balance)) {
      throw new MCPError(MCPErrorType.INSUFFICIENT_FUNDS, 'Insufficient funds for this transaction');
    }
  }
  
  /**
   * Send funds to the specified destination address with async processing
   * @param destinationAddress Address to send the funds to
   * @param amount Amount of funds to send as a string (decimal value)
   * @returns Initial transaction information with identifier
   * @throws MCPError if wallet is not ready or basic validation fails
   */
  public async sendFunds(destinationAddress: string, amount: string): Promise<SendFundsProcessingResult> {
    if (!this.isReady()) {
      throw new MCPError(MCPErrorType.WALLET_NOT_READY, 'Wallet is not ready');
    }
    
    try {
      // Quick validation before returning
      await this.validateSendFundsParams(destinationAddress, amount);
      
      // Generate a transaction identifier
      const txIdentifier = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      
      // Prepare initial result to return immediately
      const initialResult: SendFundsProcessingResult = {
        status: 'pending',
        processIdentifier: txIdentifier,
        destinationAddress,
        amount
      };
      
      // Process the transaction asynchronously
      this.processFundsTransferAsync(txIdentifier, destinationAddress, amount);
      
      return initialResult;
    } catch (error) {
      this.logger.error('Failed to initiate funds transfer', error);
      throw new MCPError(MCPErrorType.TX_SUBMISSION_FAILED, 'Failed to initiate transaction');
    }
  }
  
  /**
   * Process a funds transfer asynchronously
   * @param txIdentifier The transaction identifier
   * @param destinationAddress Address to send the funds to
   * @param amount Amount of funds to send
   */
  private async processFundsTransferAsync(
    txIdentifier: string, 
    destinationAddress: string, 
    amount: string
  ): Promise<void> {
    try {
      // Send notification that transaction is pending
      this.sendTransactionStatusNotification({
        txIdentifier,
        status: TransactionStatus.PENDING,
        message: 'Transaction processing started',
        destinationAddress,
        amount
      });
      
      // Perform the actual transaction
      const result = await this.wallet.sendFunds(destinationAddress, amount);
      
      // Update the transaction identifier with the real one
      const finalTxIdentifier = result.txIdentifier || txIdentifier;
      
      // Send success notification
      this.sendTransactionStatusNotification({
        txIdentifier: finalTxIdentifier,
        status: TransactionStatus.SUCCESS,
        message: 'Transaction completed successfully',
        destinationAddress,
        amount: result.amount
      });
    } catch (error) {
      this.logger.error(`Transaction ${txIdentifier} failed:`, error);
      
      // Send failure notification
      this.sendTransactionStatusNotification({
        txIdentifier,
        status: TransactionStatus.FAILED,
        message: 'Transaction failed',
        destinationAddress,
        amount,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // set notification handler
  public setNotificationHandler(handler: (notification: TransactionNotification) => void): void {
    this.notificationHandler = handler;
  }

  // send notification
  public sendNotification(): void {
    this.sendTransactionStatusNotification({
      txIdentifier: 'test',
      status: TransactionStatus.SUCCESS,
      message: 'Test notification',
      destinationAddress: '0x1234567890abcdef',
      amount: '1000000000000000000'
    });
  }
  
  /**
   * Send a transaction status notification to connected clients
   * @param notification The transaction notification payload
   */
  public sendTransactionStatusNotification(notification: TransactionNotification): void {
    this.logger.info(`Transaction status update: ${notification.txIdentifier} - ${notification.status}`);
    if (this.notificationHandler) {
      this.notificationHandler(notification);
    } else {
      this.logger.warn('No notification handler set, skipping notification');
    }
  }
  
  /**
   * Verify if a transaction with the specified identifier has been received by the wallet
   * 
   * @param identifier The transaction identifier to verify (not the transaction hash)
   * @returns Verification result with transaction existence and sync status
   * @throws MCPError if wallet is not ready or verification fails
   */
  public confirmTransactionHasBeenReceived(identifier: string): TransactionVerificationResult {
    if (!this.isReady()) {
      throw new MCPError(MCPErrorType.WALLET_NOT_READY, 'Wallet is not ready');
    }
    
    try {
      return this.wallet.hasReceivedTransactionByIdentifier(identifier);
    } catch (error) {
      this.logger.error('Error verifying transaction by identifier', error);
      throw new MCPError(
        MCPErrorType.IDENTIFIER_VERIFICATION_FAILED, 
        `Failed to verify transaction with identifier: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Get detailed wallet status including sync progress, readiness, and recovery state
   * @returns Detailed wallet status with sync information
   * @throws MCPError if there's an issue retrieving wallet status
   */
  public getWalletStatus(): WalletStatus {
    try {
      return this.wallet.getWalletStatus();
    } catch (error) {
      this.logger.error('Error getting wallet status', error);
      throw new MCPError(
        MCPErrorType.WALLET_NOT_READY,
        `Failed to retrieve wallet status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Close the MCP server and associated resources
   */
  public async close(): Promise<void> {
    try {
      await this.wallet.close();
      this.logger.info('MCP Server shut down successfully');
    } catch (error) {
      this.logger.error('Error shutting down MCP Server', error);
    }
  }
}

// Export default instance
export default MCPServer;
