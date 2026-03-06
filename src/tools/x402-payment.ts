import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactSvmScheme, toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import { getNetwork, getRpcUrl, SOLANA_CAIP2 } from "../config.js";

async function createX402Client() {
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) {
    throw new Error("SOLANA_PRIVATE_KEY environment variable is required.");
  }

  const network = getNetwork();
  const rpcUrl = getRpcUrl(network);
  const caip2 = SOLANA_CAIP2[network];

  // @solana/kit expects the full 64-byte keypair (secret + public)
  const secretKeyBytes = bs58.decode(key);
  const keypairSigner = await createKeyPairSignerFromBytes(secretKeyBytes);
  const svmSigner = toClientSvmSigner(keypairSigner);
  const scheme = new ExactSvmScheme(svmSigner, { rpcUrl });

  const client = new x402Client().register(caip2 as `${string}:${string}`, scheme);
  return client;
}

export function registerX402PaymentTool(server: McpServer) {
  server.tool(
    "make_x402_payment",
    "Fetch a resource from an x402-protected endpoint, automatically handling USDC payment on Solana via the x402 protocol",
    {
      url: z.string().url().describe("The x402-protected endpoint URL"),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .default("GET")
        .describe("HTTP method (default: GET)"),
      body: z
        .string()
        .optional()
        .describe("Optional JSON request body (for POST/PUT)"),
      headers: z
        .record(z.string())
        .optional()
        .describe("Optional additional HTTP headers"),
    },
    async ({ url, method, body, headers }) => {
      try {
        const client = await createX402Client();
        const paidFetch = wrapFetchWithPayment(fetch, client);

        const init: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        };

        if (body && (method === "POST" || method === "PUT")) {
          init.body = body;
        }

        const response = await paidFetch(url, init);

        const responseText = await response.text();
        const paymentResponse = response.headers.get("x-payment-response");

        let responseBody: unknown;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = responseText;
        }

        const result: Record<string, unknown> = {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
        };

        if (paymentResponse) {
          try {
            result.paymentReceipt = JSON.parse(
              Buffer.from(paymentResponse, "base64").toString()
            );
          } catch {
            result.paymentReceipt = paymentResponse;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error making x402 payment: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
}
