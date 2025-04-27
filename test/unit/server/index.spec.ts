import { jest } from '@jest/globals';

// Mock MCP
const mockMcpServer = {
  isReady: jest.fn().mockReturnValue(false),
  close: jest.fn().mockImplementation(() => Promise.resolve()),
};

// Mock the MCPServer class
const mockMCPServerClass = jest.fn().mockImplementation(() => mockMcpServer);

// Mock the module imports
jest.mock('../../../src/mcp/index.js', () => ({
  MCPServer: mockMCPServerClass,
  MCPError: class MCPError extends Error {
    constructor(public type: string, message: string) {
      super(message);
      this.name = 'MCPError';
    }
  },
  MCPErrorType: {
    WALLET_NOT_READY: 'WALLET_NOT_READY',
  },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../../../src/logger/index.js', () => ({
  logger: mockLogger,
  configureGlobalLogging: jest.fn(),
  CloudProvider: {
    GCP: 'gcp',
    AWS: 'aws',
    AZURE: 'azure',
    NONE: 'none',
  },
}));

// Create types for the mocked functions
type MockHandlerType = (event: string, callback: (...args: any[]) => any) => void;
type MockExitType = (code?: number) => void;
type MockIntervalType = (callback: () => void, ms: number) => number;
type MockClearIntervalType = (id: number) => void;

// Explicitly define these mocks at the top level
const mockOn = jest.fn() as unknown as MockHandlerType;
const mockExit = jest.fn() as unknown as MockExitType;
const mockSetInterval = jest.fn().mockReturnValue(123) as unknown as MockIntervalType;
const mockClearInterval = jest.fn() as unknown as MockClearIntervalType;

describe('Server Module', () => {
  // Store the handler and interval callback for tests
  let sigintHandler: () => Promise<void>;
  let intervalCallback: () => void;
  
  // Save original environment and global objects
  const originalEnv = { ...process.env };
  const originalProcessOn = process.on;
  const originalProcessExit = process.exit;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  
  beforeEach(() => {
    // Setup mock environment
    jest.resetModules();
    
    // Override process.env
    process.env = {
      LOG_LEVEL: 'debug',
      NODE_ENV: 'development',
      APP_VERSION: '1.0.0-test',
    };
    
    // Apply mocks that capture the handlers
    Object.defineProperty(process, 'on', {
      value: (event: string, handler: any) => {
        mockOn(event, handler);
        if (event === 'SIGINT') {
          sigintHandler = handler;
        }
        return process;
      },
      writable: true,
    });
    
    Object.defineProperty(process, 'exit', {
      value: mockExit,
      writable: true,
    });
    
    Object.defineProperty(global, 'setInterval', {
      value: (callback: () => void, ms: number) => {
        intervalCallback = callback;
        return mockSetInterval(callback, ms);
      },
      writable: true,
    });
    
    Object.defineProperty(global, 'clearInterval', {
      value: mockClearInterval,
      writable: true,
    });
    
    // Reset all mocks
    jest.clearAllMocks();
    mockMcpServer.isReady.mockReturnValue(false);
    
    // Mock config without external proof server
    jest.mock('../../../src/config.js', () => ({
      config: {
        networkId: 'TestNet',
        seed: 'mock seed phrase',
        walletFilename: 'test-wallet.json',
        useExternalProofServer: false,
        proofServer: undefined as string | undefined,
        indexer: undefined as string | undefined,
        indexerWS: undefined as string | undefined,
        node: undefined as string | undefined,
      },
    }));
  });
  
  afterEach(() => {
    // Restore original environment and globals
    process.env = originalEnv;
    Object.defineProperty(process, 'on', {
      value: originalProcessOn,
      writable: true,
    });
    Object.defineProperty(process, 'exit', {
      value: originalProcessExit,
      writable: true,
    });
    Object.defineProperty(global, 'setInterval', {
      value: originalSetInterval,
      writable: true,
    });
    Object.defineProperty(global, 'clearInterval', {
      value: originalClearInterval,
      writable: true,
    });
  });
  
  describe('Basic Initialization Tests', () => {
    it('should initialize the server with internal proof server', async () => {
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify MCPServer was initialized with the correct parameters
      expect(mockMCPServerClass).toHaveBeenCalledWith(
        'TestNet',
        'mock seed phrase',
        'test-wallet.json',
        undefined // No external config since useExternalProofServer is false
      );
      
      // Verify logs were output
      expect(mockLogger.info).toHaveBeenCalledWith('Using network ID: TestNet');
      expect(mockLogger.info).toHaveBeenCalledWith('Using internal Docker-based proof server');
      expect(mockLogger.info).toHaveBeenCalledWith('MCP Server initialized, wallet synchronization started in background');
    });
    
    it('should initialize the server with external proof server', async () => {
      // Mock config for external proof server
      jest.resetModules();
      jest.mock('../../../src/config.js', () => ({
        config: {
          networkId: 'TestNet',
          seed: 'mock seed phrase',
          walletFilename: 'test-wallet.json',
          useExternalProofServer: true,
          proofServer: 'https://proof.example.com',
          indexer: 'https://indexer.example.com',
          indexerWS: 'wss://indexer-ws.example.com',
          node: 'https://node.example.com',
        },
      }));
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify MCPServer was initialized with external config
      expect(mockMCPServerClass).toHaveBeenCalledWith(
        'TestNet',
        'mock seed phrase',
        'test-wallet.json',
        expect.objectContaining({
          proofServer: 'https://proof.example.com',
          indexer: 'https://indexer.example.com',
          indexerWS: 'wss://indexer-ws.example.com',
          node: 'https://node.example.com',
          useExternalProofServer: true,
          networkId: 'TestNet'
        })
      );
      
      // Verify logs were output
      expect(mockLogger.info).toHaveBeenCalledWith('Using external proof server configuration');
      expect(mockLogger.info).toHaveBeenCalledWith('External proof server: https://proof.example.com');
    });
  });
  
  describe('Error Handling Tests', () => {
    it('should throw error if PROOF_SERVER is missing when using external proof server', async () => {
      // Mock config with missing proof server
      jest.resetModules();
      jest.mock('../../../src/config.js', () => ({
        config: {
          networkId: 'TestNet',
          seed: 'mock seed phrase',
          walletFilename: 'test-wallet.json',
          useExternalProofServer: true,
          proofServer: undefined,
          indexer: 'https://indexer.example.com',
          indexerWS: 'wss://indexer-ws.example.com',
          node: 'https://node.example.com',
        },
      }));
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing MCP Server:',
        expect.objectContaining({
          message: expect.stringContaining('PROOF_SERVER')
        })
      );
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
    
    it('should throw error if INDEXER is missing when using external proof server', async () => {
      // Mock config with missing indexer
      jest.resetModules();
      jest.mock('../../../src/config.js', () => ({
        config: {
          networkId: 'TestNet',
          seed: 'mock seed phrase',
          walletFilename: 'test-wallet.json',
          useExternalProofServer: true,
          proofServer: 'https://proof.example.com',
          indexer: undefined,
          indexerWS: 'wss://indexer-ws.example.com',
          node: 'https://node.example.com',
        },
      }));
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing MCP Server:',
        expect.objectContaining({
          message: expect.stringContaining('INDEXER')
        })
      );
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
    
    it('should throw error if INDEXER_WS is missing when using external proof server', async () => {
      // Mock config with missing indexer_ws
      jest.resetModules();
      jest.mock('../../../src/config.js', () => ({
        config: {
          networkId: 'TestNet',
          seed: 'mock seed phrase',
          walletFilename: 'test-wallet.json',
          useExternalProofServer: true,
          proofServer: 'https://proof.example.com',
          indexer: 'https://indexer.example.com',
          indexerWS: undefined,
          node: 'https://node.example.com',
        },
      }));
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing MCP Server:',
        expect.objectContaining({
          message: expect.stringContaining('INDEXER_WS')
        })
      );
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
    
    it('should throw error if NODE is missing when using external proof server', async () => {
      // Mock config with missing node
      jest.resetModules();
      jest.mock('../../../src/config.js', () => ({
        config: {
          networkId: 'TestNet',
          seed: 'mock seed phrase',
          walletFilename: 'test-wallet.json',
          useExternalProofServer: true,
          proofServer: 'https://proof.example.com',
          indexer: 'https://indexer.example.com',
          indexerWS: 'wss://indexer-ws.example.com',
          node: undefined,
        },
      }));
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing MCP Server:',
        expect.objectContaining({
          message: expect.stringContaining('NODE')
        })
      );
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
    
    it('should handle errors during initialization', async () => {
      // Mock MCPServerClass to throw an error
      mockMCPServerClass.mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });
      
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify error was logged and process exits
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing MCP Server:',
        expect.objectContaining({
          message: 'Initialization failed'
        })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
  
  describe('Runtime Behavior Tests', () => {  
    it('should setup a process handler for graceful shutdown', async () => {
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify process handler was set up
      expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      
      // Ensure handler was captured and call it
      expect(sigintHandler).toBeDefined();
      if (sigintHandler) {
        await sigintHandler();
      }
      
      // Verify close was called and process exits
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
    
    it('should setup a ready check interval that stops when ready', async () => {
      // Import the server module which will run the main function
      await import('../../../src/server.js');
      
      // Verify setInterval was called with correct timing
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
      
      // Ensure callback was captured
      expect(intervalCallback).toBeDefined();
      if (intervalCallback) {
        // Call the callback when wallet is not ready
        intervalCallback();
        
        // Verify logs and that interval isn't cleared
        expect(mockLogger.info).toHaveBeenCalledWith('Wallet syncing in progress, MCP server is responsive but wallet not fully ready yet...');
        expect(mockClearInterval).not.toHaveBeenCalled();
        
        // Change mock to return ready
        mockMcpServer.isReady.mockReturnValue(true);
        
        // Call the callback again
        intervalCallback();
        
        // Verify ready logs and that interval is cleared
        expect(mockLogger.info).toHaveBeenCalledWith('Wallet is now fully synced and ready for operations!');
        expect(mockClearInterval).toHaveBeenCalledWith(123);
      }
    });
  });
}); 