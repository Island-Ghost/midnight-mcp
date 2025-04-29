# Transaction Tracking System

This module provides a transaction tracking system for the Midnight wallet to track the lifecycle of transactions from initiation to completion.

## Overview

Transactions go through the following states:

1. **INITIATED**: The transaction has been requested but not yet broadcast to the network.
2. **SENT**: The transaction has been broadcast to the network with a `txIdentifier`.
3. **COMPLETED**: The transaction appears in the wallet's transaction history, confirming it's been processed by the blockchain.
4. **FAILED**: The transaction has failed due to an error.

## Database

The system uses SQLite to persist transaction state across application restarts. The database file is stored in the wallet backup folder with a name based on the wallet filename.

## Usage

### Initiating a Transaction

To initiate a transaction without waiting for it to be broadcast:

```typescript
const result = await walletManager.initiateSendFunds('recipient_address', '10.5');
console.log(`Transaction initiated with ID: ${result.id}`);
```

The `initiateSendFunds` method returns immediately with a transaction ID, while the transaction processing continues asynchronously.

### Checking Transaction Status

To check the status of a transaction:

```typescript
const status = walletManager.getTransactionStatus('transaction_id');
console.log(`Transaction state: ${status.transaction.state}`);
```

### Getting All Transactions

To get all transactions:

```typescript
const allTransactions = walletManager.getTransactions();
```

To get transactions in a specific state:

```typescript
const pendingTransactions = walletManager.getTransactions(TransactionState.SENT);
```

### Getting Pending Transactions

To get all transactions that are still pending (INITIATED or SENT):

```typescript
const pendingTransactions = walletManager.getPendingTransactions();
```

## Automatic Status Updates

The system automatically checks for completed transactions at regular intervals. When a transaction is detected in the blockchain history, its state is updated to COMPLETED.

## Implementation Details

- The transaction database is automatically initialized when the WalletManager is created.
- Transactions are automatically tracked through their lifecycle.
- In case of wallet restart or application crash, the transaction tracking will resume from the persisted state.
- The original `sendFunds` method is still available for backward compatibility and for cases where you want to wait for the transaction to be broadcast before continuing. 