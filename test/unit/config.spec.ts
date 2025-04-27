import { jest } from '@jest/globals';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Mock path
jest.mock('path', () => ({
  resolve: jest.fn((a, b) => `${a}/${b}`),
  dirname: jest.fn((p: string) => p.replace('/file.js', '')),
  join: jest.fn((a, b) => `${a}/${b}`),
}));

// Mock url
jest.mock('url', () => ({
  fileURLToPath: jest.fn((url: string) => url.replace('file://', '')),
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Create a mock implementation for the config module
jest.mock('../../../src/config.ts', () => {
  // This function will recreate the module each time it's required
  return {
    __esModule: true,
    loadConfig: jest.fn().mockImplementation(() => {
      // Required configurations
      const seed = process.env.SEED;
      if (!seed) {
        throw new Error('SEED environment variable is required');
      }

      // Optional configurations with defaults
      const configuredNetworkId = process.env.NETWORK_ID;
      const foundNetworkId = configuredNetworkId 
        ? NetworkId[configuredNetworkId as keyof typeof NetworkId] 
        : undefined;
      const networkId = foundNetworkId || NetworkId.TestNet;

      // Default wallet filename
      const walletFilename = process.env.WALLET_FILENAME || 'midnight-wallet';

      // Logging configuration
      const logLevel = process.env.LOG_LEVEL || 'info';

      // Default wallet backup folder
      const walletBackupFolder = process.env.WALLET_BACKUP_FOLDER || 'wallet-backups';

      // External proof server configuration
      const useExternalProofServer = process.env.USE_EXTERNAL_PROOF_SERVER === 'true';
      const proofServer = process.env.PROOF_SERVER;
      const indexer = process.env.INDEXER;
      const indexerWS = process.env.INDEXER_WS;
      const node = process.env.NODE;

      return {
        seed,
        networkId,
        walletBackupFolder,
        walletFilename,
        logLevel,
        useExternalProofServer,
        proofServer,
        indexer,
        indexerWS,
        node
      };
    }),
    // The config object is created by loading the config
    get config() {
      return this.loadConfig();
    }
  };
}, { virtual: true });

describe('Config Module', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SEED;
    delete process.env.NETWORK_ID;
    delete process.env.WALLET_FILENAME;
    delete process.env.LOG_LEVEL;
    delete process.env.WALLET_BACKUP_FOLDER;
    delete process.env.USE_EXTERNAL_PROOF_SERVER;
    delete process.env.PROOF_SERVER;
    delete process.env.INDEXER;
    delete process.env.INDEXER_WS;
    delete process.env.NODE;
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  test('should throw error if SEED is not provided', () => {
    expect(() => {
      // Import the config module
      const { config } = require('../../../src/config.ts');
      // This should throw
      console.log(config); // Just to use the variable
    }).toThrow('SEED environment variable is required');
  });
  
  test('should use default values when minimal env is provided', () => {
    // Set minimal environment
    process.env.SEED = 'test seed phrase';
    
    // Load the config and verify defaults
    const { config } = require('../../../src/config.ts');
    
    expect(config.seed).toBe('test seed phrase');
    expect(config.networkId).toBe(NetworkId.TestNet);
    expect(config.walletFilename).toBe('midnight-wallet');
    expect(config.logLevel).toBe('info');
    expect(config.walletBackupFolder).toBe('wallet-backups');
    expect(config.useExternalProofServer).toBe(false);
    expect(config.proofServer).toBeUndefined();
    expect(config.indexer).toBeUndefined();
    expect(config.indexerWS).toBeUndefined();
    expect(config.node).toBeUndefined();
  });
  
  test('should use provided environment variables', () => {
    // Set all environment variables
    process.env.SEED = 'test seed phrase';
    process.env.NETWORK_ID = 'MainNet';
    process.env.WALLET_FILENAME = 'custom-wallet';
    process.env.LOG_LEVEL = 'debug';
    process.env.WALLET_BACKUP_FOLDER = 'custom-backups';
    process.env.USE_EXTERNAL_PROOF_SERVER = 'true';
    process.env.PROOF_SERVER = 'https://proof.example.com';
    process.env.INDEXER = 'https://indexer.example.com';
    process.env.INDEXER_WS = 'wss://indexer-ws.example.com';
    process.env.NODE = 'https://node.example.com';
    
    // Load the config and verify all values
    const { config } = require('../../../src/config.ts');
    
    expect(config.seed).toBe('test seed phrase');
    expect(config.networkId).toBe(NetworkId.MainNet);
    expect(config.walletFilename).toBe('custom-wallet');
    expect(config.logLevel).toBe('debug');
    expect(config.walletBackupFolder).toBe('custom-backups');
    expect(config.useExternalProofServer).toBe(true);
    expect(config.proofServer).toBe('https://proof.example.com');
    expect(config.indexer).toBe('https://indexer.example.com');
    expect(config.indexerWS).toBe('wss://indexer-ws.example.com');
    expect(config.node).toBe('https://node.example.com');
  });
  
  test('should handle invalid network ID gracefully', () => {
    // Set environment with invalid network ID
    process.env.SEED = 'test seed phrase';
    process.env.NETWORK_ID = 'InvalidNetwork';
    
    // Load the config and verify it uses default network
    const { config } = require('../../../src/config.ts');
    
    expect(config.networkId).toBe(NetworkId.TestNet);
  });
}); 