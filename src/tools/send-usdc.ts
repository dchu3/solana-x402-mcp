import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  getConnection,
  getKeypair,
  getUsdcTokenAccountAddress,
  getNetwork,
  getUsdcMint,
  getExplorerUrl,
  USDC_DECIMALS,
} from "../config.js";

export function registerSendUsdcTool(server: McpServer) {
  server.tool(
    "send_usdc",
    "Send USDC from the configured wallet to a recipient Solana address",
    {
      recipient: z.string().describe("Recipient Solana wallet address"),
      amount: z
        .string()
        .describe('Amount of USDC to send (e.g. "1.50" for 1.50 USDC)'),
    },
    async ({ recipient, amount }) => {
      try {
        const network = getNetwork();
        const connection = getConnection(network);
        const keypair = getKeypair();
        const usdcMint = getUsdcMint(network);

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Invalid amount "${amount}". Must be a positive number.`,
              },
            ],
          };
        }

        const tokenAmount = BigInt(
          Math.round(parsedAmount * 10 ** USDC_DECIMALS)
        );

        const recipientPubkey = new PublicKey(recipient);
        const senderAta = await getUsdcTokenAccountAddress(
          keypair.publicKey,
          network
        );
        const recipientAta = await getUsdcTokenAccountAddress(
          recipientPubkey,
          network
        );

        const transaction = new Transaction();

        // Create recipient's ATA if it doesn't exist
        try {
          await getAccount(connection, recipientAta);
        } catch {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              keypair.publicKey,
              recipientAta,
              recipientPubkey,
              usdcMint
            )
          );
        }

        transaction.add(
          createTransferCheckedInstruction(
            senderAta,
            usdcMint,
            recipientAta,
            keypair.publicKey,
            tokenAmount,
            USDC_DECIMALS
          )
        );

        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair]
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  signature,
                  from: keypair.publicKey.toBase58(),
                  to: recipient,
                  amount: parsedAmount.toFixed(USDC_DECIMALS),
                  network,
                  explorerUrl: getExplorerUrl(signature, network),
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
              text: `Error sending USDC: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
}
