import { jest } from '@jest/globals';
import { MCPServer, MCPErrorType, MCPError } from '../../../src/mcp/index.js';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Mock the wallet module and create test data
const mockWalletData = {
  isReady: jest.fn(() => true),
  getAddress: jest.fn(() => 'mdnt1test_address123456789'),
  getBalance: jest.fn(() => BigInt(1000)),
  sendFunds: jest.fn(() => Promise.resolve({
    txHash: 'mock_tx_hash',
    syncedIndices: BigInt(10),
    totalIndices: BigInt(10),
    isFullySynced: true
  })),
  hasReceivedTransactionByIdentifier: jest.fn(() => ({
    exists: true,
    syncedIndices: BigInt(10),
    totalIndices: BigInt(10),
    isFullySynced: true
  })),
  close: jest.fn(() => Promise.resolve())
};

// Mock the wallet module
jest.mock('../../../src/wallet/index.js', () => ({
  WalletManager: jest.fn().mockImplementation(() => mockWalletData)
}));

// Mock the logger module
jest.mock('../../../src/logger/index.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }))
}));

// Mock setTimeout
jest.useFakeTimers();

describe('MCPServer', () => {
  let mcpServer: MCPServer;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset default behaviors
    mockWalletData.isReady.mockReturnValue(true);
    mockWalletData.getAddress.mockReturnValue('mdnt1test_address123456789');
    mockWalletData.getBalance.mockReturnValue(BigInt(1000));
    mockWalletData.sendFunds.mockResolvedValue({
      txHash: 'mock_tx_hash',
      syncedIndices: BigInt(10),
      totalIndices: BigInt(10),
      isFullySynced: true
    });
    mockWalletData.hasReceivedTransactionByIdentifier.mockReturnValue({
      exists: true,
      syncedIndices: BigInt(10),
      totalIndices: BigInt(10),
      isFullySynced: true
    });
    
    // Create a new MCPServer instance
    mcpServer = new MCPServer(
      NetworkId.Undeployed,
      'seed phrase for testing',
      'test-wallet.json'
    );
  });
  
  afterEach(async () => {
    await mcpServer.close();
  });
  
  describe('isReady', () => {
    it('should return the ready status from the wallet manager', () => {
      const result = mcpServer.isReady();
      expect(result).toBe(true);
    });
  });
  
  describe('getAddress', () => {
    it('should return the wallet address when wallet is ready', () => {
      const address = mcpServer.getAddress();
      expect(address).toBe('mdnt1test_address123456789');
    });
    
    it('should throw an error when wallet is not ready', () => {
      // Override isReady for this test
      jest.spyOn(mcpServer, 'isReady').mockReturnValue(false);
      
      try {
        mcpServer.getAddress();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
      }
    });

    it('should throw an error when the wallet getAddress function fails', () => {
      // Mock an error in the wallet's getAddress method
      mockWalletData.getAddress.mockImplementation(() => {
        throw new Error('Access error');
      });
      
      try {
        mcpServer.getAddress();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
        expect(error.message).toBe('Error accessing wallet address');
      }
    });
  });
  
  describe('getBalance', () => {
    it('should return the wallet balance when wallet is ready', () => {
      const balance = mcpServer.getBalance();
      expect(balance).toBe(BigInt(1000));
    });
    
    it('should throw an error when wallet is not ready', () => {
      // Override isReady for this test
      jest.spyOn(mcpServer, 'isReady').mockReturnValue(false);
      
      try {
        mcpServer.getBalance();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
      }
    });

    it('should throw an error when the wallet getBalance function fails', () => {
      // Mock an error in the wallet's getBalance method
      mockWalletData.getBalance.mockImplementation(() => {
        throw new Error('Access error');
      });
      
      try {
        mcpServer.getBalance();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
        expect(error.message).toBe('Error accessing wallet balance');
      }
    });
  });
  
  describe('sendFunds', () => {
    it('should send funds when wallet is ready and has sufficient funds', async () => {
      const result = await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
      
      expect(result).toEqual({
        txHash: 'mock_tx_hash',
        syncStatus: {
          syncedIndices: BigInt(10),
          totalIndices: BigInt(10),
          isFullySynced: true
        }
      });
    });
    
    it('should throw an error when wallet is not ready', async () => {
      // Override isReady for this test
      jest.spyOn(mcpServer, 'isReady').mockReturnValue(false);
      
      try {
        await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
      }
    });
    
    it('should throw an error when there are insufficient funds', async () => {
      // Override getBalance for this test
      mockWalletData.getBalance.mockReturnValue(BigInt(50)); // Less than 100
      
      try {
        await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.INSUFFICIENT_FUNDS);
      }
    });
    
    it('should handle transaction submission failures', async () => {
      // Mock a failed transaction
      mockWalletData.sendFunds.mockRejectedValue(new Error('Transaction failed'));
      
      try {
        await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.TX_SUBMISSION_FAILED);
      }
    });

    it('should update transaction status after a timeout', async () => {
      const result = await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
      expect(result.txHash).toBe('mock_tx_hash');
      
      // Verify initial transaction status is 'pending'
      const statusBefore = mcpServer.validateTx('mock_tx_hash');
      expect(statusBefore.status).toBe('pending');
      
      // Fast forward time to trigger the timeout
      jest.advanceTimersByTime(5000);
      
      // Verify status changed to 'confirmed'
      const statusAfter = mcpServer.validateTx('mock_tx_hash');
      expect(statusAfter.status).toBe('confirmed');
    });
  });
  
  describe('validateTx', () => {
    beforeEach(async () => {
      // Create a transaction that we can validate
      await mcpServer.sendFunds('mdnt1recipient_address', BigInt(100));
    });
    
    it('should return the transaction status if the transaction exists', () => {
      const status = mcpServer.validateTx('mock_tx_hash');
      expect(status.status).toBe('pending');
    });
    
    it('should throw an error if the transaction does not exist', () => {
      try {
        mcpServer.validateTx('non_existent_tx_hash');
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.TX_NOT_FOUND);
      }
    });
    
    it('should throw an error when wallet is not ready', () => {
      // Override isReady for this test
      jest.spyOn(mcpServer, 'isReady').mockReturnValue(false);
      
      try {
        mcpServer.validateTx('mock_tx_hash');
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
      }
    });
  });
  
  describe('hasReceivedTransactionByIdentifier', () => {
    it('should verify transaction existence by identifier', () => {
      const result = mcpServer.hasReceivedTransactionByIdentifier('test_identifier');
      
      expect(result).toEqual({
        exists: true,
        syncStatus: {
          syncedIndices: BigInt(10),
          totalIndices: BigInt(10),
          isFullySynced: true
        }
      });
    });
    
    it('should throw an error when wallet is not ready', () => {
      // Override isReady for this test
      jest.spyOn(mcpServer, 'isReady').mockReturnValue(false);
      
      try {
        mcpServer.hasReceivedTransactionByIdentifier('test_identifier');
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.WALLET_NOT_READY);
      }
    });
    
    it('should handle verification failures', () => {
      // Mock a verification failure
      mockWalletData.hasReceivedTransactionByIdentifier.mockImplementation(() => {
        throw new Error('Verification failed');
      });
      
      try {
        mcpServer.hasReceivedTransactionByIdentifier('test_identifier');
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect(error.type).toBe(MCPErrorType.IDENTIFIER_VERIFICATION_FAILED);
      }
    });
  });

  describe('close', () => {
    it('should close the wallet successfully', async () => {
      await mcpServer.close();
      expect(mockWalletData.close).toHaveBeenCalled();
    });

    it('should handle errors during wallet closing', async () => {
      // Mock an error during close
      mockWalletData.close.mockRejectedValue(new Error('Close error'));
      
      // The close method catches errors, so it should not throw
      await expect(mcpServer.close()).resolves.toBeUndefined();
    });
  });

  describe('constructor', () => {
    it('should set network ID if provided', () => {
      // Create a new instance with a specific network ID
      const testServer = new MCPServer(
        NetworkId.MainNet,
        'seed phrase for testing',
        'test-wallet.json'
      );
      
      // We can't directly test the internal network ID set, but we can verify the constructor completed
      expect(testServer).toBeInstanceOf(MCPServer);
      
      // Clean up
      testServer.close();
    });

    it('should initialize with external config if provided', () => {
      const externalConfig = {
        indexer: 'https://test-indexer.com',
        indexerWS: 'wss://test-indexer-ws.com',
        node: 'https://test-node.com',
        proofServer: 'https://test-proof-server.com'
      };

      const testServer = new MCPServer(
        NetworkId.Undeployed,
        'seed phrase for testing',
        'test-wallet.json',
        externalConfig
      );
      
      expect(testServer).toBeInstanceOf(MCPServer);
      
      // Clean up
      testServer.close();
    });
  });
}); 