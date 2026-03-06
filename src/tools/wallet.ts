import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getConnection,
  getNetwork,
  getUsdcMint,
  getUsdcTokenAccountAddress,
  getWalletPublicKey,
  USDC_DECIMALS,
} from "../config.js";

export function registerWalletTools(server: McpServer) {
  server.tool(
    "get_wallet_info",
    "Get the configured wallet's public key, SOL balance, USDC balance, and current network",
    {},
    async () => {
      try {
        const network = getNetwork();
        const connection = getConnection(network);
        const publicKey = getWalletPublicKey();

        const solBalance = await connection.getBalance(publicKey);
        const usdcMint = getUsdcMint(network);
        let usdcBalance = "0";

        try {
          const ata = await getUsdcTokenAccountAddress(publicKey, network);
          const tokenBalance = await connection.getTokenAccountBalance(ata);
          usdcBalance = tokenBalance.value.uiAmountString ?? "0";
        } catch {
          // No USDC account exists yet
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  publicKey: publicKey.toBase58(),
                  network,
                  solBalance: (solBalance / LAMPORTS_PER_SOL).toFixed(9),
                  usdcBalance,
                  usdcMint: usdcMint.toBase58(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_sol_balance",
    "Check SOL balance for a Solana wallet address",
    {
      address: z
        .string()
        .describe("Solana wallet address to check balance for"),
    },
    async ({ address }) => {
      try {
        const network = getNetwork();
        const connection = getConnection(network);
        const publicKey = new PublicKey(address);
        const balance = await connection.getBalance(publicKey);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address,
                  network,
                  solBalance: (balance / LAMPORTS_PER_SOL).toFixed(9),
                  lamports: balance,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_usdc_balance",
    "Check USDC balance for a Solana wallet address",
    {
      address: z
        .string()
        .describe("Solana wallet address to check USDC balance for"),
    },
    async ({ address }) => {
      try {
        const network = getNetwork();
        const connection = getConnection(network);
        const publicKey = new PublicKey(address);
        const usdcMint = getUsdcMint(network);

        let usdcBalance = "0";
        let rawAmount = "0";

        try {
          const ata = await getUsdcTokenAccountAddress(publicKey, network);
          const tokenBalance = await connection.getTokenAccountBalance(ata);
          usdcBalance = tokenBalance.value.uiAmountString ?? "0";
          rawAmount = tokenBalance.value.amount;
        } catch {
          // No USDC account exists
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address,
                  network,
                  usdcBalance,
                  rawAmount,
                  decimals: USDC_DECIMALS,
                  usdcMint: usdcMint.toBase58(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
}
