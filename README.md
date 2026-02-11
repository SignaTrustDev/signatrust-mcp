# @signatrust/mcp-server

Model Context Protocol (MCP) server for the SignaTrust document signing API. Enables AI assistants like Claude to create envelopes, manage templates, check signing status, and verify blockchain anchors via natural language.

## Quick Start

### Claude Code

```bash
claude mcp add signatrust -- npx -y @signatrust/mcp-server
```

Then set your API key in the MCP server environment.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "signatrust": {
      "command": "npx",
      "args": ["-y", "@signatrust/mcp-server"],
      "env": {
        "SIGNATRUST_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Required Scope |
|------|-------------|---------------|
| `list_envelopes` | List envelopes with status filter and pagination | `envelopes:read` |
| `get_envelope` | Get full envelope details (signers, docs, blockchain) | `envelopes:read` |
| `create_envelope` | Create and send envelope for signing | `envelopes:write` |
| `void_envelope` | Void an active envelope | `envelopes:write` |
| `list_templates` | List available document templates | `templates:read` |
| `create_from_template` | Create envelope from template (3-step) | `templates:read` + `envelopes:write` |
| `verify_blockchain` | Verify Solana blockchain anchor | *(public)* |
| `get_envelope_stats` | Get envelope count statistics | `envelopes:read` |

## API Key Scopes

Create an API key at **Settings > API Keys** in your SignaTrust dashboard. Assign scopes based on what tools you need:

| Scope | Tools Enabled |
|-------|--------------|
| `envelopes:read` | list_envelopes, get_envelope, get_envelope_stats |
| `envelopes:write` | create_envelope, void_envelope |
| `templates:read` | list_templates, create_from_template |
| `documents:write` | create_from_template (document creation step) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIGNATRUST_API_KEY` | Yes | - | API key starting with `sk_live_` |
| `SIGNATRUST_API_URL` | No | `https://app.signatrust.io` | API base URL |

## Natural Language Examples

Once connected, you can ask your AI assistant things like:

- "List all my pending envelopes"
- "Send an NDA to alice@example.com for signing"
- "Check the blockchain verification for envelope env_abc123"
- "Void envelope env_xyz because we sent the wrong document"
- "Show me available templates"
- "Create a lease agreement from template for John Doe"
- "How many envelopes have been completed this month?"

## Development

Internal `@signatrustdev/*` packages are hosted on [GitHub Packages](https://github.com/orgs/SignaTrustDev/packages). Authentication is configured via `.npmrc` and requires a `NODE_AUTH_TOKEN` with `read:packages` scope.

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Local smoke test
SIGNATRUST_API_KEY=sk_live_xxx SIGNATRUST_API_URL=http://localhost:3000 node dist/server.js
```

## Architecture

```
src/
  server.ts          # Entry point — env validation, MCP server setup, stdio transport
  handlers.ts        # Tool definitions and handler dispatch (testable)
  errors.ts          # RFC 7807 ProblemDetails -> MCP tool error mapping
  *.test.ts          # Co-located test files
```

The HTTP client and API types come from [`@signatrustdev/signatrust-sdk`](https://www.npmjs.com/package/@signatrustdev/signatrust-sdk).
