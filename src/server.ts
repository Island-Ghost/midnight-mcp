import { MCPServer, MCPErrorType, MCPError } from './mcp/index.js';
import { config } from './config.js';
import { logger, configureGlobalLogging, CloudProvider } from './logger/index.js';
import { WalletConfig } from './wallet/index.js';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
      const isReady = mcpServer.isReady();
      res.json({ 
        status: isReady ? 'ready' : 'syncing',
        ready: isReady,
        version: process.env.APP_VERSION || '0.0.1',
        networkId: config.networkId
      });
    });
    
    // Get wallet address
    app.get('/address', checkWalletReady, (req, res) => {
      try {
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
    
    // Get wallet balance
    app.get('/balance', checkWalletReady, (req, res) => {
      try {
        const balance = mcpServer.getBalance();
        res.json({ balance: balance.toString() });
      } catch (error) {
        logger.error('Error getting balance', error);
        res.status(500).json({ 
          error: 'Failed to get balance', 
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    // Send funds
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
        
        // Convert amount to BigInt (client might send as string or number)
        const amountBigInt = BigInt(amount);
        
        const result = await mcpServer.sendFunds(destinationAddress, amountBigInt);
        res.json(result);
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
    
    // Check transaction by identifier
    app.get('/tx/identifier/:identifier', checkWalletReady, (req, res) => {
      try {
        const { identifier } = req.params;
        const result = mcpServer.confirmTransactionHasBeenReceived(identifier);
        res.json(result);
      } catch (error) {
        logger.error('Error checking transaction by identifier', error);
        res.status(500).json({ 
          error: 'Failed to verify transaction by identifier', 
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