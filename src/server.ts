#!/usr/bin/env node

/**
 * SignaTrust MCP Server
 *
 * Model Context Protocol server enabling AI assistants to interact with the
 * SignaTrust document signing API. Supports envelope management, templates,
 * blockchain verification, and more.
 *
 * Setup:
 *   SIGNATRUST_API_KEY=sk_live_xxx npx @signatrust/mcp-server
 *
 * Or add to claude_desktop_config.json:
 *   { "mcpServers": { "signatrust": { "command": "npx", "args": ["-y", "@signatrust/mcp-server"], "env": { "SIGNATRUST_API_KEY": "sk_live_xxx" } } } }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SignaTrustClient, ApiError } from "./vendor/signatrust-sdk/index.js";
import { formatApiError } from "./errors.js";
import { TOOLS, handleTool } from "./handlers.js";

// =============================================================================
// Configuration
// =============================================================================

const API_KEY = process.env.SIGNATRUST_API_KEY;
const API_URL =
  process.env.SIGNATRUST_API_URL || "https://app.signatrust.io";
const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS;

if (!API_KEY) {
  console.error(
    "Error: SIGNATRUST_API_KEY environment variable is required.\n" +
      "Get your API key at https://app.signatrust.io/settings/api-keys",
  );
  process.exit(1);
}

// Staging is fronted by Vercel's deployment protection. Forwarding the bypass
// header lets harness runs and staging smoke tests reach the application.
// In production the env var is unset, so nothing is forwarded.
// Note: do NOT also send x-vercel-set-bypass-cookie — that triggers a
// redirect loop under node's fetch because cookies aren't persisted across
// the follow-up request.
const extraHeaders: Record<string, string> = {};
if (VERCEL_PROTECTION_BYPASS) {
  extraHeaders["x-vercel-protection-bypass"] = VERCEL_PROTECTION_BYPASS;
}

const client = new SignaTrustClient({
  apiKey: API_KEY,
  baseUrl: API_URL,
  extraHeaders,
});

// =============================================================================
// Server Setup
// =============================================================================

const server = new Server(
  {
    name: "signatrust",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    return await handleTool(client, name, args);
  } catch (error) {
    if (error instanceof ApiError) {
      return formatApiError(error.status, error.body, error.retryAfter);
    }
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }
});

// =============================================================================
// Start
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SignaTrust MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
