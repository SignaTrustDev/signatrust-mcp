# signatrust-mcp-server

> ⚠️ **This is a redirect stub.** The canonical SignaTrust MCP server is published as **`@signatrust/mcp-server`** (scoped).

If you arrived here by dropping the scope from the canonical name, install the scoped package instead:

```bash
npx -y @signatrust/mcp-server
```

Or in `claude_desktop_config.json`:

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

See https://github.com/SignaTrustDev/signatrust-mcp for documentation.
