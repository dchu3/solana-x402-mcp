# solana-x402-mcp

An MCP (Model Context Protocol) server that enables AI agents to make USDC payments on Solana via the [x402 protocol](https://github.com/coinbase/x402).

## Features

- **Send USDC** — Transfer USDC to any Solana address
- **Check USDC Balance** — Query USDC balance for any wallet
- **Inspect Incoming USDC Payments** — Review recent inbound USDC transfers to the configured wallet
- **Check SOL Balance** — Query SOL balance for any wallet
- **x402 Payments** — Automatically pay for x402-protected API endpoints with USDC
- **Wallet Info** — View configured wallet address, balances, and network

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLANA_PRIVATE_KEY` | ✅ | — | Base58-encoded Solana private key |
| `SOLANA_NETWORK` | ❌ | `devnet` | `mainnet` or `devnet` |
| `SOLANA_RPC_URL` | ❌ | Public RPC | Custom Solana RPC endpoint |

## Usage

### As an MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "solana-x402": {
      "command": "node",
      "args": ["/path/to/solana-x402-mcp/dist/index.js"],
      "env": {
        "SOLANA_PRIVATE_KEY": "your-base58-private-key",
        "SOLANA_NETWORK": "devnet"
      }
    }
  }
}
```

## Tools

### get_wallet_info

Get the configured wallet's public key, SOL balance, USDC balance, and current network.

```
get_wallet_info({})
```

### get_sol_balance

Check SOL balance for a Solana wallet address.

**Parameters:**
- `address` (string, required): Solana wallet address

```
get_sol_balance({ address: "So11111111111111111111111111111111111111112" })
```

### get_usdc_balance

Check USDC balance for a Solana wallet address.

**Parameters:**
- `address` (string, required): Solana wallet address

```
get_usdc_balance({ address: "7nYJKfE1bf6pBP2H2UwMRe5MT4c4GHxfbQqCGTqJNj2c" })
```

### get_incoming_usdc_payments

Inspect recent inbound USDC transfers for the configured wallet.

**Parameters:**
- `limit` (number, optional): Maximum number of recent wallet USDC-account signatures to inspect (default: `20`)
- `beforeSignature` (string, optional): Pagination cursor for older transactions
- `minAmount` (string, optional): Minimum received amount in USDC to include (for example `"1.5"`)

```
get_incoming_usdc_payments({ limit: 10, minAmount: "1.00" })
```

### send_usdc

Send USDC from the configured wallet to a recipient.

**Parameters:**
- `recipient` (string, required): Recipient Solana wallet address
- `amount` (string, required): Amount of USDC to send (e.g. `"1.50"`)

```
send_usdc({ recipient: "7nYJKfE1bf6pBP2H2UwMRe5MT4c4GHxfbQqCGTqJNj2c", amount: "1.50" })
```

### make_x402_payment

Fetch a resource from an x402-protected endpoint, automatically handling USDC payment on Solana.

**Parameters:**
- `url` (string, required): The x402-protected endpoint URL
- `method` (string, optional): HTTP method — `GET`, `POST`, `PUT`, `DELETE` (default: `GET`)
- `body` (string, optional): JSON request body for POST/PUT
- `headers` (object, optional): Additional HTTP headers

```
make_x402_payment({ url: "https://api.example.com/paid-resource" })
```

## How x402 Works

The [x402 protocol](https://x402.org) uses the HTTP 402 "Payment Required" status code to enable programmatic payments:

1. Client requests a resource from an x402-protected endpoint
2. Server responds with `402` and payment requirements (amount, token, network)
3. Client signs a USDC payment on Solana
4. Client retries the request with the payment proof
5. Server verifies payment and returns the resource

This MCP server handles steps 2–5 automatically via the `make_x402_payment` tool.

## Development

```bash
npm install
npm run build
npm start
```

## License

ISC
