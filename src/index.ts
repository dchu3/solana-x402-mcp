#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerWalletTools } from "./tools/wallet.js";
import { registerSendUsdcTool } from "./tools/send-usdc.js";
import { registerX402PaymentTool } from "./tools/x402-payment.js";
import { registerIncomingPaymentTool } from "./tools/incoming-payments.js";

const server = new McpServer({
  name: "solana-x402-mcp",
  version: "1.0.0",
});

registerWalletTools(server);
registerSendUsdcTool(server);
registerX402PaymentTool(server);
registerIncomingPaymentTool(server);

async function main() {
  if (!process.env.SOLANA_PRIVATE_KEY) {
    console.error(
      "Error: SOLANA_PRIVATE_KEY environment variable is required.\n" +
        "Set it to a base58-encoded Solana private key.\n" +
        "Optional: SOLANA_NETWORK (mainnet|devnet, default: devnet)\n" +
        "Optional: SOLANA_RPC_URL (custom RPC endpoint)"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
