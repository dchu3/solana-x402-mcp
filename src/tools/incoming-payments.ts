import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ParsedInnerInstruction,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  TokenBalance,
} from "@solana/web3.js";
import { z } from "zod";
import {
  getConnection,
  getExplorerUrl,
  getNetwork,
  getUsdcMint,
  getUsdcTokenAccountAddress,
  getWalletPublicKey,
  USDC_DECIMALS,
} from "../config.js";

type ParsedInstructionData = {
  type: string;
  info: Record<string, unknown>;
};

type AccountTokenBalance = {
  amount: bigint;
  decimals: number;
};

function isParsedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction
): instruction is ParsedInstruction {
  return "parsed" in instruction;
}

function getParsedInstructionData(
  instruction: ParsedInstruction
): ParsedInstructionData | null {
  const parsed = instruction.parsed;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    !("info" in parsed)
  ) {
    return null;
  }

  const { type, info } = parsed;
  if (typeof type !== "string" || typeof info !== "object" || info === null) {
    return null;
  }

  return {
    type,
    info: info as Record<string, unknown>,
  };
}

function getAccountAddress(
  transaction: ParsedTransactionWithMeta,
  accountIndex: number
): string | null {
  const account = transaction.transaction.message.accountKeys[accountIndex];
  if (!account) {
    return null;
  }

  const pubkey =
    typeof account === "object" && "pubkey" in account ? account.pubkey : account;

  return typeof pubkey === "string" ? pubkey : pubkey.toBase58();
}

function getTokenBalanceForAccount(
  transaction: ParsedTransactionWithMeta,
  accountAddress: string,
  mintAddress: string,
  balances: Array<TokenBalance> | null | undefined
): AccountTokenBalance | null {
  for (const balance of balances ?? []) {
    const indexedAddress = getAccountAddress(transaction, balance.accountIndex);
    if (indexedAddress !== accountAddress || balance.mint !== mintAddress) {
      continue;
    }

    return {
      amount: BigInt(balance.uiTokenAmount.amount),
      decimals: balance.uiTokenAmount.decimals,
    };
  }

  return null;
}

function flattenParsedInstructions(
  transaction: ParsedTransactionWithMeta
): ParsedInstruction[] {
  const topLevel = transaction.transaction.message.instructions.filter(
    isParsedInstruction
  );
  const innerInstructions =
    transaction.meta?.innerInstructions?.flatMap(
      (instructionSet: ParsedInnerInstruction) =>
        instructionSet.instructions.filter(isParsedInstruction)
    ) ?? [];

  return [...topLevel, ...innerInstructions];
}

type InboundTransferContext = {
  sender: string | null;
  sourceTokenAccount: string | null;
  senders: string[];
  sourceTokenAccounts: string[];
  instructionAmount: bigint | null;
};

function findInboundTransferContext(
  transaction: ParsedTransactionWithMeta,
  walletUsdcAccount: string,
  usdcMintAddress: string
): InboundTransferContext {
  const matches: Array<{ sender: string | null; sourceTokenAccount: string | null; amount: bigint | null }> = [];

  for (const instruction of flattenParsedInstructions(transaction)) {
    if (instruction.program !== "spl-token") {
      continue;
    }

    const parsed = getParsedInstructionData(instruction);
    if (!parsed || !parsed.type.startsWith("transfer")) {
      continue;
    }

    const destination = parsed.info.destination;
    if (destination !== walletUsdcAccount) {
      continue;
    }

    const mint = parsed.info.mint;
    if (typeof mint === "string" && mint !== usdcMintAddress) {
      continue;
    }

    let amount: bigint | null = null;
    const rawAmount = parsed.info.amount ?? parsed.info.tokenAmount;
    if (typeof rawAmount === "string") {
      amount = BigInt(rawAmount);
    } else if (
      typeof rawAmount === "object" &&
      rawAmount !== null &&
      "amount" in rawAmount &&
      typeof (rawAmount as Record<string, unknown>).amount === "string"
    ) {
      amount = BigInt((rawAmount as Record<string, string>).amount);
    }

    matches.push({
      sourceTokenAccount:
        typeof parsed.info.source === "string" ? parsed.info.source : null,
      sender:
        typeof parsed.info.authority === "string" ? parsed.info.authority : null,
      amount,
    });
  }

  const senders = Array.from(
    new Set(
      matches
        .map(({ sender }) => sender)
        .filter((sender): sender is string => sender !== null)
    )
  );
  const sourceTokenAccounts = Array.from(
    new Set(
      matches
        .map(({ sourceTokenAccount }) => sourceTokenAccount)
        .filter(
          (sourceTokenAccount): sourceTokenAccount is string =>
            sourceTokenAccount !== null
        )
    )
  );

  const allAmountsAvailable = matches.length > 0 && matches.every((m) => m.amount !== null);
  const instructionAmount = allAmountsAvailable
    ? matches.reduce((sum, m) => sum + m.amount!, 0n)
    : null;

  return {
    sender: matches.length === 1 ? matches[0].sender : null,
    sourceTokenAccount: matches.length === 1 ? matches[0].sourceTokenAccount : null,
    senders,
    sourceTokenAccounts,
    instructionAmount,
  };
}

function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseTokenAmount(value: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = value.split(".");
  if (fractionPart.length > decimals) {
    return null;
  }

  const normalized = `${wholePart}${fractionPart.padEnd(decimals, "0")}`;
  return BigInt(normalized);
}

export function registerIncomingPaymentTool(server: McpServer) {
  server.tool(
    "get_incoming_usdc_payments",
    "Inspect recent inbound USDC transfers for the configured Solana wallet",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of recent wallet USDC-account signatures to inspect"),
      beforeSignature: z
        .string()
        .optional()
        .describe("Optional signature cursor for paginating older transactions"),
      minAmount: z
        .string()
        .optional()
        .describe('Optional minimum received amount in USDC (for example "1.5")'),
    },
    async ({ limit, beforeSignature, minAmount }) => {
      try {
        const network = getNetwork();
        const connection = getConnection(network);
        const walletPublicKey = getWalletPublicKey();
        const walletUsdcAccount = await getUsdcTokenAccountAddress(
          walletPublicKey,
          network
        );
        const usdcMintAddress = getUsdcMint(network).toBase58();

        const minimumAmount =
          minAmount === undefined
            ? 0n
            : parseTokenAmount(minAmount, USDC_DECIMALS);
        if (minimumAmount === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Invalid minAmount "${minAmount}". Use a non-negative USDC amount with up to ${USDC_DECIMALS} decimal places.`,
              },
            ],
          };
        }

        const signatures = await connection.getSignaturesForAddress(
          walletUsdcAccount,
          {
            limit,
            before: beforeSignature,
          },
          "confirmed"
        );

        const parsedTransactions = await connection.getParsedTransactions(
          signatures.map(({ signature }) => signature),
          {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }
        );

        const payments = parsedTransactions.flatMap((transaction, index) => {
          if (!transaction || transaction.meta?.err) {
            return [];
          }

          const preBalance = getTokenBalanceForAccount(
            transaction,
            walletUsdcAccount.toBase58(),
            usdcMintAddress,
            transaction.meta?.preTokenBalances
          );
          const postBalance = getTokenBalanceForAccount(
            transaction,
            walletUsdcAccount.toBase58(),
            usdcMintAddress,
            transaction.meta?.postTokenBalances
          );

          const decimals = postBalance?.decimals ?? preBalance?.decimals ?? USDC_DECIMALS;

          const {
            sender,
            sourceTokenAccount,
            senders,
            sourceTokenAccounts,
            instructionAmount,
          } = findInboundTransferContext(
            transaction,
            walletUsdcAccount.toBase58(),
            usdcMintAddress
          );

          // Prefer summed instruction amounts; fall back to balance delta
          const balanceDelta = (postBalance?.amount ?? 0n) - (preBalance?.amount ?? 0n);
          const receivedAmount = instructionAmount ?? (balanceDelta > 0n ? balanceDelta : 0n);

          if (receivedAmount <= 0n || receivedAmount < minimumAmount) {
            return [];
          }

          const signatureInfo = signatures[index];
          const blockTime = transaction.blockTime ?? signatureInfo?.blockTime ?? null;

          return [
            {
              signature: signatureInfo.signature,
              slot: signatureInfo.slot,
              blockTime,
              confirmedAt:
                blockTime === null
                  ? null
                  : new Date(blockTime * 1000).toISOString(),
              amount: formatTokenAmount(receivedAmount, decimals),
              rawAmount: receivedAmount.toString(),
              decimals,
              sender,
              senders,
              sourceTokenAccount,
              sourceTokenAccounts,
              explorerUrl: getExplorerUrl(signatureInfo.signature, network),
            },
          ];
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  walletPublicKey: walletPublicKey.toBase58(),
                  walletUsdcAccount: walletUsdcAccount.toBase58(),
                  network,
                  scannedSignatures: signatures.length,
                  beforeSignature: signatures.at(-1)?.signature ?? null,
                  payments,
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
              text: `Error loading incoming payments: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
}
