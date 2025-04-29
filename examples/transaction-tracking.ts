/**
 * Example of using the transaction tracking system
 */
import { WalletManager, TestnetRemoteConfig } from '../src/wallet/index.js';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { TransactionState } from '../src/types/wallet.js';

// Sample wallet seed (replace with your actual seed)
const seed = 'your_wallet_seed_here';

/**
 * Example of initiating and tracking transactions
 */
async function runTransactionExample() {
  console.log('Starting transaction example...');
  
  // Create wallet manager instance
  const walletManager = new WalletManager(
    NetworkId.TestNet,
    seed,
    'example-wallet',
    new TestnetRemoteConfig()
  );
  
  try {
    // Wait for wallet to be ready
    console.log('Waiting for wallet to be ready...');
    await waitForWalletReady(walletManager);
    console.log('Wallet is ready!');
    
    // Get wallet address and balance
    const address = walletManager.getAddress();
    const balance = walletManager.getBalance();
    console.log(`Wallet address: ${address}`);
    console.log(`Wallet balance: ${balance.balance}`);
    
    // Initiate a transaction without waiting for broadcast
    const recipientAddress = 'recipient_address_here';
    const amount = '0.1'; // Small amount for testing
    
    console.log(`Initiating transaction to ${recipientAddress} for ${amount}...`);
    const initiateResult = await walletManager.initiateSendFunds(recipientAddress, amount);
    
    console.log(`Transaction initiated with ID: ${initiateResult.id}`);
    console.log(`Initial state: ${initiateResult.state}`);
    
    // Poll for transaction status updates
    await pollTransactionStatus(walletManager, initiateResult.id);
    
    // Get all transactions
    console.log('\nAll transactions:');
    const allTransactions = walletManager.getTransactions();
    allTransactions.forEach(tx => {
      console.log(`- ID: ${tx.id}, State: ${tx.state}, Amount: ${tx.amount}, To: ${tx.toAddress}`);
    });
    
    // Get pending transactions
    console.log('\nPending transactions:');
    const pendingTransactions = walletManager.getPendingTransactions();
    pendingTransactions.forEach(tx => {
      console.log(`- ID: ${tx.id}, State: ${tx.state}, Amount: ${tx.amount}, To: ${tx.toAddress}`);
    });
    
  } catch (error) {
    console.error('Error in transaction example:', error);
  } finally {
    // Close wallet manager
    await walletManager.close();
    console.log('Wallet manager closed');
  }
}

/**
 * Wait for wallet to be ready
 */
async function waitForWalletReady(walletManager: WalletManager, timeoutMs = 120000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const status = walletManager.isReady(true) as any;
    
    if (status.ready) {
      return;
    }
    
    if (status.synced && status.total) {
      const progress = Number((BigInt(status.synced) * 100n) / BigInt(status.total));
      console.log(`Wallet syncing: ${progress.toFixed(2)}%`);
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Wallet ready timeout exceeded');
}

/**
 * Poll for transaction status updates
 */
async function pollTransactionStatus(walletManager: WalletManager, txId: string, maxPollsCount = 30): Promise<void> {
  console.log(`\nMonitoring transaction ${txId} status changes:`);
  
  let lastState: TransactionState | null = null;
  
  for (let i = 0; i < maxPollsCount; i++) {
    const status = walletManager.getTransactionStatus(txId);
    
    if (!status) {
      console.log(`Transaction ${txId} not found`);
      return;
    }
    
    const currentState = status.transaction.state;
    
    // Only log when the state changes
    if (lastState !== currentState) {
      console.log(`[${new Date().toISOString()}] Transaction state: ${currentState}`);
      
      if (status.transaction.txIdentifier) {
        console.log(`Transaction identifier: ${status.transaction.txIdentifier}`);
      }
      
      if (status.blockchainStatus) {
        console.log(`Transaction on blockchain: ${status.blockchainStatus.exists}`);
      }
      
      lastState = currentState;
    }
    
    // If transaction is completed or failed, stop polling
    if (currentState === TransactionState.COMPLETED || currentState === TransactionState.FAILED) {
      console.log(`Transaction ${txId} finalized with state: ${currentState}`);
      if (status.transaction.errorMessage) {
        console.log(`Error message: ${status.transaction.errorMessage}`);
      }
      return;
    }
    
    // Wait a bit before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log(`Polling limit reached for transaction ${txId}`);
}

// Run the example
runTransactionExample().catch(console.error); 