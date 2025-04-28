# Midnight Wallet MCP

This module provides a secure wallet service for Eliza AI agents to interact with the Midnight blockchain.

Each agent runs its own Wallet MCP instance, responsible for managing its private keys, syncing with the blockchain, and exposing safe MCP methods for blockchain operations.

---

## Features

- Wallet initialization and local persistence.
- Continuous blockchain syncing.
- MCP API methods for:
  - Checking wallet readiness.
  - Retrieving wallet address and balance.
  - Sending funds.
  - Validating transactions.
- Secure by design: no external access to private keys or seed management.
- API key authentication for secure communication between agents and MCP server.

---

## Environment Variables

The application uses environment variables for configuration. For development, these are loaded from a `.env` file using dotenv. In production, these should be injected via Docker or the host environment.

### Required Variables
- `SEED` - Wallet seed (required for initialization)
- `API_KEY` - Secret key for authenticating API requests

### Optional Variables
- `NETWORK_ID` - Network to connect to (`MainNet`, `TestNet`, or `DevNet`). Defaults to `TestNet`
- `WALLET_FILENAME` - Custom wallet filename. Defaults to `midnight-wallet`
- `LOG_LEVEL` - Logging level (`debug`, `info`, `warn`, `error`). Defaults to `info`

### Setup
1. Copy the `.env.example` file to `.env` (an example file is provided with all configurable options)
2. Generate a wallet seed and API key (see next section)
3. Fill in the required values in the `.env` file
4. For production, inject these environment variables via Docker or the host environment

---

## Seed and API Key Generation

The project includes a `generate-seed.ts` script in the `scripts` directory to help generate secure BIP39 mnemonics, wallet seeds, and API keys for Midnight.

### Using the Generate Seed Script

```bash
# Run the script with default options (generates wallet seed, mnemonic, and API key)
yarn generate-seed

# Generate a 12-word mnemonic (default is 24-word)
yarn generate-seed --words 12

# Add a password for additional security
yarn generate-seed --password "your-secure-password"

# Convert existing Midnight wallet seed to BIP39 mnemonic
yarn generate-seed --midnight-seed "your-hex-seed"

# Generate mnemonic from specific entropy
yarn generate-seed --entropy "your-hex-entropy"

# Derive a seed from an existing mnemonic
yarn generate-seed --mnemonic "your mnemonic phrase here"
```

The script will generate three important pieces of information:
1. **Midnight Seed** - A hexadecimal string that serves as your wallet seed
2. **BIP39 Mnemonic** - A sequence of words representing the seed
3. **API Key** - A secure random key used for authenticating API requests

**IMPORTANT NOTE:** The BIP39 mnemonic can be used with most GUI wallet applications that support the Midnight blockchain. This means anyone with access to your mnemonic phrase can access your funds through a standard wallet interface. Keep your mnemonic phrase secure and private.

### Available Options

| Option | Description |
|--------|-------------|
| `-w, --words <number>` | Number of words in mnemonic (12 or 24). Default: 24 |
| `-p, --password <string>` | Optional password for additional security |
| `-f, --format <string>` | Seed format: "full" (64 bytes) or "compact" (32 bytes). Default: full |
| `-e, --entropy <hex>` | Use provided hex entropy to generate mnemonic |
| `-s, --seed <hex>` | Treat the provided hex as seed, verify by converting to mnemonic and back |
| `-m, --mnemonic <string>` | Use provided mnemonic to generate seed |
| `-M, --midnight-seed <hex>` | Generate a compatible BIP39 mnemonic for a Midnight wallet seed |

### Midnight Wallet Seed Note

For Midnight wallet, the seed is the entropy value used to generate the BIP39 mnemonic. When using the script, you should save both the seed and the mnemonic for complete wallet recovery.

---

## Development Tool

The project includes an interactive CLI tool (`scripts/dev-tool.ts`) for interacting with a running Wallet MCP server via HTTP requests. This is useful for testing and debugging the MCP server locally.

### Usage

1. Ensure the MCP server is running.
2. Make sure the `API_KEY` environment variable is set correctly in your `.env` file or environment.
3. Run the tool using yarn:

```bash
yarn dev-tool
```

The tool will first prompt you to confirm or enter the URL of the running MCP server (defaulting to `http://localhost:3000`). After connecting, it presents a menu of available commands:

- **Get wallet address**: Retrieves the address associated with the wallet managed by the MCP server.
- **Get wallet balance**: Fetches the current available and pending balance.
- **Send funds to an address**: Prompts for a destination address and amount, then initiates a transaction.
- **Check for transaction by identifier**: Looks up the status of a transaction using its identifier.
- **Get detailed wallet status**: Shows detailed information about the wallet's sync status, readiness, and recovery state.
- **Check server status**: Pings the server's `/status` endpoint.
- **Exit**: Quits the tool.

---

## API Authentication

The MCP server requires authentication for all API requests. API keys are generated using the `generate-seed.ts` script alongside the wallet seed.

Authentication can be provided in one of two ways:

1. **HTTP Header** (recommended):
   ```
   x-api-key: your-generated-api-key
   ```

2. **Query Parameter**:
   ```
   ?api_key=your-generated-api-key
   ```

Example code for making authenticated requests:

```javascript
// Using x-api-key header (recommended)
fetch('http://localhost:3000/address', {
  headers: {
    'x-api-key': 'your-api-key-here'
  }
})

// Using query parameter
fetch('http://localhost:3000/address?api_key=your-api-key-here')
```

The API key must be configured in the `.env` file with the `API_KEY` variable.

---

## MCP API Methods

| Method              | Description                      |
|---------------------|----------------------------------|
| `isReady()`         | Checks if the wallet is synced and ready. |
| `getAddress()`      | Returns the wallet's receiving address. |
| `getBalance()`      | Retrieves the available wallet balance. |
| `sendFunds(destinationAddress, amount)` | Sends funds to another address. |
| `validateTx(txHash)` | Validates the status of a transaction. |

For full method details, see [docs/wallet-mcp-api.md](./docs/wallet-mcp-api.md).

---

## Design Principles

- **No createWallet/exportSeed exposed externally** — wallet creation and restoration is internal only.
- **No blocking calls** — if the wallet is not ready, MCP immediately returns an error.
- **Persistence** — wallet state is saved locally for restart recovery.
- **Per-agent isolation** — each AI agent has its own separate Wallet MCP instance.
- **Secure authentication** — API key provides controlled access to wallet operations.

---

## Production Deployment

For detailed instructions on deploying the MCP server in a production environment, see [PRODUCTION.md](./PRODUCTION.md).

---

## Future Extensions

- Disclosed transactions (proof of sender, amount visibility).
- Advanced wallet features like multi-address support.

---

## License

Private project. All rights reserved.
