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
| `create_envelope` | Create and send envelope for signing. Accepts `documentIds` (after `upload_document`) or `templateId` (backend copies the template). Supports three-tier `securityLevel`. | `envelopes:write` |
| `list_templates` | List available document templates | `templates:read` |
| `upload_document` | Read a local file and upload it to SignaTrust, returning a document ID for `create_envelope` | `documents:write` |
| `download_document` | Get a time-limited pre-signed URL to download a document (e.g. the executed PDF) | `documents:read` |
| `analyze_document` | Run AI contract analysis on an envelope (Gemini-powered risk/sentiment review, plan-gated) | `ai:analyze` |
| `verify_blockchain` | Verify Solana anchor and return composite hash + file hash + explorer URL | `envelopes:read` |
| `get_evidence` | Get the full court-ready evidence bundle (envelope, signers, audit trail, blockchain verification) | `envelopes:read` |

**Three-tier security.** `create_envelope` accepts `securityLevel`: `STANDARD` (bearer token only), `VERIFIED` (adds SMS/email OTP — recommended for employment, vendor, or healthcare consent), or `CERTIFIED` (adds WebAuthn biometric + device binding — recommended for real estate, high-value, or regulatory signings).

## API Key Scopes

Create an API key at **Settings > API Keys** in your SignaTrust dashboard. Assign scopes based on what tools you need:

| Scope | Tools Enabled |
|-------|--------------|
| `envelopes:read` | list_envelopes, get_envelope, verify_blockchain, get_evidence |
| `envelopes:write` | create_envelope |
| `templates:read` | list_templates |
| `documents:write` | upload_document |
| `documents:read` | download_document |
| `ai:analyze` | analyze_document |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIGNATRUST_API_KEY` | Yes | - | API key starting with `sk_live_` |
| `SIGNATRUST_API_URL` | No | `https://app.signatrust.io` | API base URL |

## Natural Language Examples

Once connected, you can ask your AI assistant things like:

- "List all my pending envelopes"
- "Upload ~/Documents/nda.pdf and send it to alice@example.com with VERIFIED security"
- "Show me available templates, then create a lease agreement from the residential template for John Doe"
- "Check the blockchain verification for envelope env_abc123 and show me the composite hash"
- "Run AI analysis on envelope env_xyz — I want to know if there are any risky clauses before the signer reviews it"

## Development

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
  server.ts                      # Entry point — env validation, MCP server setup, stdio transport
  handlers.ts                    # Tool definitions and handler dispatch (testable)
  errors.ts                      # RFC 7807 ProblemDetails -> MCP tool error mapping
  vendor/signatrust-sdk/         # Vendored HTTP client + types (zero external runtime deps)
  *.test.ts                      # Co-located test files
```

The HTTP client and API types are vendored under `src/vendor/signatrust-sdk/` so
this package has no external runtime dependencies beyond `@modelcontextprotocol/sdk`.
