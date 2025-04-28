import { MCPServer, MCPErrorType, MCPError } from './mcp/index.js';
import { config } from './config.js';
import { logger, configureGlobalLogging, CloudProvider } from './logger/index.js';
import { WalletConfig } from './wallet/index.js';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import crypto from 'crypto';

// Configure global logging settings based on environment
configureGlobalLogging({
  level: (process.env.LOG_LEVEL as any) || 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
  enableFileOutput: process.env.NODE_ENV === 'production',
  defaultLogFile: './logs/midnight-mcp.log',
  // Example: Configure GCP logging if in production and GCP_PROJECT_ID is set
  ...(process.env.NODE_ENV === 'production' && process.env.GCP_PROJECT_ID ? {
    cloud: {
      provider: CloudProvider.GCP,
      config: {
        projectId: process.env.GCP_PROJECT_ID,
        logName: 'midnight-mcp-logs',
        resource: {
          type: 'k8s_container',
          labels: {
            cluster_name: process.env.K8S_CLUSTER_NAME || 'midnight-cluster',
            namespace_name: process.env.K8S_NAMESPACE || 'default',
            pod_name: process.env.POD_NAME || 'midnight-mcp',
            container_name: 'midnight-mcp',
          },
        },
      },
    },
  } : {}),
  // Standard fields to include with all logs
  standardFields: {
    application: 'midnight-mcp',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.1',
  },
});

// Define the port for the server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// API Authentication configuration
const API_KEY = process.env.API_KEY || (process.env.NODE_ENV !== 'production' ? 'dev-midnight-api-key' : undefined);

// Log API key status
if (API_KEY) {
  // Mask key in logs for security
  const maskedKey = API_KEY.length > 8 
    ? `${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}`
    : '********';
  
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`Using development API key: ${API_KEY}`);
  } else {
    logger.info(`API authentication enabled with key: ${maskedKey}`);
  }
} else {
  logger.info('API authentication disabled');
  throw new Error('No API_KEY defined. Authentication is mandatory.');
}

/**
 * Implementation showing how to use the MCPServer with MCP SDK
 */
async function main() {
  // Configuration is loaded from the config module which handles environment variables
  logger.info(`Using network ID: ${config.networkId}`);
  
  try {
    // Check if we should use an external proof server
    let externalConfig: WalletConfig | undefined;
    
    if (config.useExternalProofServer) {
      logger.info('Using external proof server configuration');
      
      // Validate that all required connection parameters are provided
      if (!config.proofServer) {
        throw new Error('PROOF_SERVER environment variable is required when USE_EXTERNAL_PROOF_SERVER=true');
      }
      
      if (!config.indexer) {
        throw new Error('INDEXER environment variable is required when USE_EXTERNAL_PROOF_SERVER=true');
      }
      
      if (!config.indexerWS) {
        throw new Error('INDEXER_WS environment variable is required when USE_EXTERNAL_PROOF_SERVER=true');
      }
      
      if (!config.node) {
        throw new Error('NODE environment variable is required when USE_EXTERNAL_PROOF_SERVER=true');
      }
      
      // Create external config
      externalConfig = {
        proofServer: config.proofServer,
        indexer: config.indexer,
        indexerWS: config.indexerWS,
        node: config.node,
        useExternalProofServer: true,
        networkId: config.networkId
      };
      
      logger.info(`External proof server: ${externalConfig.proofServer}`);
      logger.info(`External indexer: ${externalConfig.indexer}`);
      logger.info(`External indexer WS: ${externalConfig.indexerWS}`);
      logger.info(`External node: ${externalConfig.node}`);
    } else {
      logger.info('Using internal Docker-based proof server');
    }
    
    // Create an instance of the MCP server
    // This will start the Docker environment and begin wallet sync in the background
    const mcpServer = new MCPServer(
      config.networkId, 
      config.seed, 
      config.walletFilename,
      externalConfig
    );
    
    logger.info('MCP Server initialized, wallet synchronization started in background');
    
    // Create an Express application to handle HTTP requests
    const app = express();

    // Configure middleware
    app.use(cors());
    app.use(express.json());
    
    // Authentication middleware
    const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Skip authentication if no API key is configured or for public endpoints
      const isPublicEndpoint = req.path === '/' || req.path === '/status';
      if (isPublicEndpoint || !API_KEY) {
        return next();
      }
      
      // Get API key from header or query parameter
      let apiKey: string | undefined;
      
      // Try to get API key from header
      const apiKeyHeader = req.headers['x-api-key'];
      if (typeof apiKeyHeader === 'string') {
        apiKey = apiKeyHeader;
      }
      
      // If no API key in header, try query parameter
      if (!apiKey && req.query.api_key) {
        const queryApiKey = req.query.api_key;
        if (typeof queryApiKey === 'string') {
          apiKey = queryApiKey;
        }
      }
      
      // Check if API key is valid (matches configured key)
      if (!apiKey || apiKey !== API_KEY) {
        logger.warn(`Authentication failed for ${req.path}`, { 
          ip: req.ip, 
          userAgent: req.headers['user-agent'],
          apiKey: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'missing'
        });
        
        res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Valid API key is required' 
        });
        return;
      }
      
      // Log successful authentication
      logger.debug(`Authenticated request to ${req.path} with API key`);
      next();
    };
    
    // Add authentication middleware
    app.use(authenticateApiKey);
    
    // Create a middleware to check if wallet is ready
    const checkWalletReady = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!mcpServer.isReady()) {
        res.status(503).json({ 
          error: 'Wallet not ready', 
          type: MCPErrorType.WALLET_NOT_READY,
          message: 'Wallet is still syncing. Please try again later.' 
        });
        return;
      }
      next();
    };

    // Define routes that match the dev-tool client
    
    // Root route for connection testing
    app.get('/', (req, res) => {
      res.json({ status: 'ok', message: 'Midnight MCP Server is running' });
    });
    
    // Status endpoint
    app.get('/status', (req, res) => {
      try {
        const walletStatus = mcpServer.getWalletStatus();
        res.json({ 
          status: walletStatus.ready ? 'ready' : 'syncing',
          ready: walletStatus.ready,
          version: process.env.APP_VERSION || '0.0.1',
          networkId: config.networkId,
          details: {
            syncing: walletStatus.syncing,
            syncProgress: {
              synced: walletStatus.syncProgress.synced.toString(),
              total: walletStatus.syncProgress.total.toString(),
              percentage: walletStatus.syncProgress.percentage
            },
            address: walletStatus.address,
            balances: walletStatus.balances,
            recovering: walletStatus.recovering,
            recoveryAttempts: walletStatus.recoveryAttempts,
            maxRecoveryAttempts: walletStatus.maxRecoveryAttempts,
            isFullySynced: walletStatus.isFullySynced
          }
        });
      } catch (error) {
        // Fallback to basic status if full wallet status isn't available yet
        const isReady = mcpServer.isReady();
        res.json({ 
          status: isReady ? 'ready' : 'initializing',
          ready: isReady,
          version: process.env.APP_VERSION || '0.0.1',
          networkId: config.networkId
        });
      }
    });
    
    // Get wallet address - available even if wallet is not fully synced
    app.get('/address', (req, res) => {
      try {
        // Access the wallet address directly if the wallet is not yet ready
        const address = mcpServer.getAddress();
        res.json({ address });
      } catch (error) {
        logger.error('Error getting address', error);
        res.status(500).json({ 
          error: 'Failed to get address', 
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    // In development, show the current API key
    if (process.env.NODE_ENV !== 'production') {
      app.get('/admin/api-key', (req, res) => {
        try {
          const maskedKey = API_KEY ? `${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}` : 'Not configured';
          res.json({ 
            apiKey: maskedKey,
            note: 'For security reasons, only a masked version is shown. The full key is available in your server logs at startup.'
          });
        } catch (error) {
          logger.error('Error retrieving API key info', error);
          res.status(500).json({ error: 'Failed to retrieve API key info' });
        }
      });
    }
    
    // Get wallet balance - requires wallet to be synced
    app.get('/balance', checkWalletReady, (req, res) => {
      try {
        const balances = mcpServer.getBalance();
        
        res.json({
          totalBalance: balances.totalBalance,
          availableBalance: balances.availableBalance,
          pendingBalance: balances.pendingBalance,
          allCoinsBalance: balances.allCoinsBalance
        });
      } catch (error) {
        logger.error('Error getting balance', error);
        res.status(500).json({ 
          error: 'Failed to get balance', 
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    // Send funds - requires wallet to be synced
    app.post('/send', checkWalletReady, async (req, res) => {
      try {
        const { destinationAddress, amount } = req.body;
        
        if (!destinationAddress || !amount) {
          res.status(400).json({ 
            error: 'Invalid parameters', 
            message: 'Both destinationAddress and amount are required' 
          });
          return;
        }
        
        // Validate amount
        // Must be a string representing a decimal value with up to 6 decimal places
        if (typeof amount !== 'string') {
          res.status(400).json({
            error: 'Invalid amount format',
            message: 'Amount must be provided as a string'
          });
          return;
        }

        // Check if the amount is a valid decimal number
        const decimalRegex = /^(\d+)(\.\d{1,6})?$/;
        if (!decimalRegex.test(amount)) {
          res.status(400).json({
            error: 'Invalid amount format',
            message: 'Amount must be a valid decimal number with up to 6 decimal places'
          });
          return;
        }

        // Amount appears valid, pass it to the MCP server as a string
        const result = await mcpServer.sendFunds(destinationAddress, amount);
        
        // Log transaction details securely (no sensitive data)
        logger.info(`Funds sent to address (masked): ${destinationAddress.substring(0, 10)}...`, {
          amount: amount,
          txIdentifier: result.txIdentifier,
          authenticated: true
        });

        // Convert BigInt values to strings before sending the response
        const responseData = {
          txIdentifier: result.txIdentifier,
          syncStatus: {
            syncedIndices: result.syncStatus.syncedIndices.toString(),
            totalIndices: result.syncStatus.totalIndices.toString(),
            isFullySynced: result.syncStatus.isFullySynced
          },
          amount: result.amount
        };
        
        res.json(responseData);
      } catch (error) {
        logger.error('Error sending funds', error);
        
        if (error instanceof MCPError) {
          res.status(400).json({ 
            error: error.type, 
            message: error.message 
          });
        } else {
          res.status(500).json({ 
            error: 'Internal server error', 
            message: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    });
    
    // Check transaction by identifier - requires wallet to be synced
    app.get('/tx/identifier/:identifier', checkWalletReady, (req, res) => {
      try {
        const { identifier } = req.params;
        const result = mcpServer.confirmTransactionHasBeenReceived(identifier);
        
        // Convert BigInt values to strings before sending the response
        const responseData = {
          exists: result.exists,
          syncStatus: {
            syncedIndices: result.syncStatus.syncedIndices.toString(),
            totalIndices: result.syncStatus.totalIndices.toString(),
            isFullySynced: result.syncStatus.isFullySynced
          }
        };
        
        res.json(responseData);
      } catch (error) {
        logger.error('Error checking transaction by identifier', error);
        res.status(500).json({ 
          error: 'Failed to verify transaction by identifier', 
          message: error instanceof Error ? error.message : String(error) 
        });
      }
    });
    
    // Add a detailed wallet status endpoint
    app.get('/wallet/status', (req, res) => {
      try {
        const walletStatus = mcpServer.getWalletStatus();
        
        // Convert BigInt values to strings before sending the response
        const responseData = {
          ready: walletStatus.ready,
          syncing: walletStatus.syncing,
          syncProgress: {
            synced: walletStatus.syncProgress.synced.toString(),
            total: walletStatus.syncProgress.total.toString(),
            percentage: walletStatus.syncProgress.percentage
          },
          address: walletStatus.address,
          balances: walletStatus.balances,
          recovering: walletStatus.recovering,
          recoveryAttempts: walletStatus.recoveryAttempts,
          maxRecoveryAttempts: walletStatus.maxRecoveryAttempts,
          isFullySynced: walletStatus.isFullySynced
        };
        
        res.json(responseData);
      } catch (error) {
        logger.error('Error getting wallet status', error);
        res.status(500).json({ 
          error: 'Failed to get wallet status', 
          message: error instanceof Error ? error.message : String(error) 
        });
      }
    });
    
    // Start the Express server
    app.listen(PORT, () => {
      logger.info(`Midnight MCP Server listening on port ${PORT}`);
    });
    
    // Set up Model Context Protocol server integration
    const mcpSdkServer = new McpServer({
      name: "midnight-mcp-server",
      version: process.env.APP_VERSION || '0.0.1'
    });
    
    // Use type assertion to access potential methods
    const mcpServerAny = mcpSdkServer as any;
    
    // Try to start the MCP SDK server
    try {
      if (mcpServerAny && typeof mcpServerAny.start === 'function') {
        await mcpServerAny.start();
        logger.info('MCP Protocol Server started');
      } else {
        logger.info('MCP Protocol Server initialized (no explicit start method)');
      }
    } catch (error) {
      logger.warn('Error starting MCP Protocol Server:', error);
    }
    
    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down servers...');
      
      // Try to stop MCP SDK server
      try {
        if (mcpServerAny && typeof mcpServerAny.stop === 'function') {
          await mcpServerAny.stop();
        }
      } catch (error) {
        logger.warn('Error stopping MCP Protocol Server:', error);
      }
      
      await mcpServer.close();
      process.exit(0);
    });
    
    // Check if wallet is ready every 5 seconds
    const readyCheck = setInterval(() => {
      if (mcpServer.isReady()) {
        logger.info('Wallet is now fully synced and ready for operations!');
        clearInterval(readyCheck);
      } else {
        logger.info('Wallet syncing in progress, MCP server is responsive but wallet not fully ready yet...');
      }
    }, 5000);
    
    logger.info('Server is ready to handle API requests, but wallet operations will return "not ready" until sync completes');
  } catch (error) {
    logger.error('Error initializing servers:', error);
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 