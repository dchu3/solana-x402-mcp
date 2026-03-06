import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58";

let cachedKeypair: Keypair | null = null;

export const USDC_MINT: Record<string, string> = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export const USDC_DECIMALS = 6;

// CAIP-2 network identifiers for @x402/svm
export const SOLANA_CAIP2: Record<string, string> = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

export type SolanaNetwork = "mainnet" | "devnet";

export function getNetwork(): SolanaNetwork {
  const net = process.env.SOLANA_NETWORK?.toLowerCase() ?? "devnet";
  if (net !== "mainnet" && net !== "devnet") {
    throw new Error(
      `Invalid SOLANA_NETWORK "${net}". Must be "mainnet" or "devnet".`
    );
  }
  return net;
}

export function getRpcUrl(network: SolanaNetwork): string {
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  return network === "mainnet"
    ? clusterApiUrl("mainnet-beta")
    : clusterApiUrl("devnet");
}

export function getConnection(network: SolanaNetwork): Connection {
  return new Connection(getRpcUrl(network), "confirmed");
}

export function getKeypair(): Keypair {
  if (cachedKeypair) {
    return cachedKeypair;
  }

  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "SOLANA_PRIVATE_KEY environment variable is required. Provide a base58-encoded Solana private key."
    );
  }
  try {
    cachedKeypair = Keypair.fromSecretKey(bs58.decode(key));
    return cachedKeypair;
  } catch {
    throw new Error(
      "Invalid SOLANA_PRIVATE_KEY. Must be a valid base58-encoded Solana secret key."
    );
  }
}

export function getWalletPublicKey(): PublicKey {
  return getKeypair().publicKey;
}

export function getUsdcMint(network: SolanaNetwork): PublicKey {
  return new PublicKey(USDC_MINT[network]);
}

export async function getUsdcTokenAccountAddress(
  owner: PublicKey,
  network: SolanaNetwork
): Promise<PublicKey> {
  return getAssociatedTokenAddress(getUsdcMint(network), owner);
}

export async function getWalletUsdcTokenAccount(
  network: SolanaNetwork
): Promise<PublicKey> {
  return getUsdcTokenAccountAddress(getWalletPublicKey(), network);
}

export function getExplorerUrl(
  signature: string,
  network: SolanaNetwork
): string {
  const base = "https://explorer.solana.com/tx";
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `${base}/${signature}${cluster}`;
}
