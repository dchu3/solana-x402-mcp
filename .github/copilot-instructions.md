# Copilot Instructions

## Build, test, and lint commands

- Install dependencies: `npm install`
- Build the project: `npm run build`
- Start the MCP server locally: `SOLANA_PRIVATE_KEY=<base58-secret> npm start`
- There is currently no `test` script, no `lint` script, and no single-test command configured in `package.json`.

## High-level architecture

- `src/index.ts` is the stdio MCP entrypoint. It creates a `McpServer`, registers all tool modules, requires `SOLANA_PRIVATE_KEY` before startup, and connects over `StdioServerTransport`.
- `src/config.ts` is the shared Solana wiring layer. It owns environment parsing, network validation, RPC URL selection, keypair decoding from base58, USDC mint selection per network, CAIP-2 identifiers for x402, and Solana explorer URL generation.
- Tool modules are split by responsibility and registered into the shared MCP server:
  - `src/tools/wallet.ts` exposes read-only wallet and balance tools (`get_wallet_info`, `get_sol_balance`, `get_usdc_balance`) using `@solana/web3.js` and SPL associated token account lookups.
  - `src/tools/send-usdc.ts` handles token transfers by deriving sender/recipient ATAs, creating the recipient ATA when missing, and submitting a checked SPL token transfer.
  - `src/tools/x402-payment.ts` builds an x402 client from the same Solana key material, wraps `fetch` with payment handling, and returns the HTTP response plus any decoded payment receipt.
- The runtime flow is: env vars -> `config.ts` helpers -> tool registration in `index.ts` -> MCP tool handlers that return text payloads containing JSON for machine-readable results.

## Key conventions

- This repository is TypeScript ESM with `moduleResolution: "NodeNext"`, so source files import local modules with `.js` extensions (for example `./tools/wallet.js`) even though the files in `src/` are `.ts`.
- New MCP capabilities should follow the existing pattern: export a `register...Tool` or `register...Tools` function from `src/tools/*`, accept `McpServer`, define the input schema inline with `zod`, and register through `server.tool(...)`.
- Tool handlers return MCP text content, not raw objects. Successful structured responses are serialized with `JSON.stringify(..., null, 2)` and wrapped in `{ content: [{ type: "text", text }] }`.
- Missing USDC token accounts are treated as zero balance in read-only wallet tools by catching ATA/token balance lookup failures. Preserve that behavior when extending wallet inspection logic.
- Network-specific Solana values are centralized in `src/config.ts` (`USDC_MINT`, `SOLANA_CAIP2`, RPC selection, explorer URLs). Reuse those helpers instead of duplicating mint addresses, network parsing, or RPC logic inside tool modules.
