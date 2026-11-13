# @signatrust/mcp-server

> Send and verify e-signatures from Claude — zero-custody, with independently verifiable cryptographic evidence for every signature.

[![npm](https://img.shields.io/npm/v/@signatrust/mcp-server)](https://www.npmjs.com/package/@signatrust/mcp-server)
[![downloads](https://img.shields.io/npm/dm/@signatrust/mcp-server)](https://www.npmjs.com/package/@signatrust/mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP-registry-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<!-- Demo slot: record a ~10s GIF of Claude sending an envelope end-to-end (use the
     Natural Language Examples below), save it to docs/demo.gif, and add here:
     ![SignaTrust MCP demo](docs/demo.gif) -->

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

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

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

### VS Code

Add to `.vscode/mcp.json` (note the top-level key is `servers`, not `mcpServers`):

```json
{
  "servers": {
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

To keep the key out of the file, use an input prompt instead of `env`:

```json
{
  "inputs": [
    { "id": "signatrust-key", "type": "promptString", "description": "SignaTrust API key", "password": true }
  ],
  "servers": {
    "signatrust": {
      "command": "npx",
      "args": ["-y", "@signatrust/mcp-server"],
      "env": { "SIGNATRUST_API_KEY": "${input:signatrust-key}" }
    }
  }
}
```

## Available Tools

All 12 tools:

| Tool | Description | Required Scope |
|------|-------------|---------------|
| `list_envelopes` | List envelopes with status filter and pagination | `envelopes:read` |
| `get_envelope` | Get full envelope details (signers, docs, blockchain) | `envelopes:read` |
| `create_envelope` | Stage an envelope as a **DRAFT**. Notifies nobody; show the user the draft, then call `send_envelope`. Accepts `documentIds` (after `upload_document`) or `templateId` (backend copies the template). Supports three-tier `securityLevel`. | `envelopes:write` |
| `send_envelope` | Send a DRAFT to its signers: the only tool that notifies them. Legally binding and irreversible; call it only after the user confirms. | `envelopes:write` |
| `void_envelope` | Cancel an envelope in progress. Signers already invited get a cancellation notice. | `envelopes:write` |
| `list_templates` | List available document templates | `templates:read` |
| `upload_document` | Read a local file and upload it to SignaTrust, returning a document ID for `create_envelope` | `documents:write` |
| `download_document` | Get a time-limited pre-signed URL to download one document, such as the signed PDF. The PDF alone: no audit trail and no signed manifest. For the verifiable evidence, use `get_evidence_bundle`. | `documents:read` |
| `analyze_document` | Run AI contract analysis on an envelope's document. The document is sent to SignaTrust's servers and analysed there by Google Gemini, so get the user's consent for that document first. Available on every plan; refused when the organization has switched AI off or is in HIPAA mode. | `ai:analyze` |
| `verify_blockchain` | Verify Solana anchor and return composite hash + file hash + explorer URL | `envelopes:read` |
| `get_evidence` | Get the envelope's evidence record as JSON (envelope, signers, audit trail, blockchain verification). No PDF and no signed manifest, so it is not the verifiable artifact; use `get_evidence_bundle` for that. | `envelopes:read` |
| `get_evidence_bundle` | Get a single-use, 15-minute download link to the sealed evidence bundle ZIP (signed PDF, signer records, audit trail, manifest signed by SignaTrust's published key), with its SHA-256, size and signing key fingerprint. Fetch the link with no auth header and verify the ZIP at https://www.signatrust.io/verify. Refusals: HTTP 409 with `code` `ENVELOPE_NOT_COMPLETED`, `BLIND_CUSTODY` or `DOCUMENT_DESTROYED`. | `envelopes:read` |

**Three-tier security.** `create_envelope` accepts `securityLevel`: `STANDARD` (bearer token only), `VERIFIED` (adds SMS/email OTP — recommended for employment, vendor, or healthcare consent), or `CERTIFIED` (adds WebAuthn biometric + device binding — recommended for real estate, high-value, or regulatory signings).

## API Key Scopes

Create an API key at **Settings > API Keys** in your SignaTrust dashboard. Assign scopes based on what tools you need:

| Scope | Tools Enabled |
|-------|--------------|
| `envelopes:read` | list_envelopes, get_envelope, verify_blockchain, get_evidence, get_evidence_bundle |
| `envelopes:write` | create_envelope, send_envelope, void_envelope |
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
- "Upload ~/Documents/nda.pdf and prepare it for alice@example.com with VERIFIED security" (the assistant stages a draft and asks you before sending)
- "Show me available templates, then create a lease agreement from the residential template for John Doe"
- "Check the blockchain verification for envelope env_abc123 and show me the composite hash"
- "Get the evidence bundle for envelope env_abc123, download it, and check its SHA-256"
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
