# Publishing to the MCP Registry

How to list `@signatrust/mcp-server` in the official [MCP Registry](https://registry.modelcontextprotocol.io),
which then propagates to the secondary catalogs (MCP.so, Glama, Smithery, MCP.Directory).

> The MCP Registry is in **preview** — breaking changes or data resets may occur before GA.

## Namespace

The server name is **`io.signatrust/mcp-server`** — the reverse-DNS form of `signatrust.io`.
This is a **domain-based** name, so it must be authorized by proving control of `signatrust.io`
(not GitHub auth). The name in `server.json` must match `mcpName` in `package.json` (both already set).

## One-time setup (already done in this repo)

- `server.json` — the registry manifest (npm package, stdio transport, env vars).
- `package.json` — `"mcpName": "io.signatrust/mcp-server"` so the registry can verify npm ownership.

## Each release

1. Bump the version in **both** `package.json` and `server.json` (top-level `version` **and** the
   `packages[0].version`) to the new published npm version. They must match.
2. `npm publish --access public` (the registry hosts metadata only — the npm artifact must exist first).
3. Re-run the publish flow below.

## Pre-flight (before every publish)

Once it is listed, the server propagates to one-click-install clients quickly, so validate first:

```bash
npm run smoke      # or: npm run e2e
# then load the server in MCP Inspector and exercise the tools/schemas
```

## Domain verification — HTTP well-known (chosen method)

We authorize `io.signatrust/*` by serving a proof file at
`https://signatrust.io/.well-known/mcp-registry-auth`. The app repo (`signatrust_new`) serves this
file the same way it serves `apple-app-site-association`.

1. Generate an Ed25519 key pair (keep `key.pem` local — **never commit the private key**):

   ```bash
   openssl genpkey -algorithm Ed25519 -out key.pem
   PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
   echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}"
   ```

2. Put that `v=MCPv1; k=ed25519; p=...` line (the **public** key only — safe to publish) into the
   `signatrust_new` well-known file and deploy. Confirm it serves:

   ```bash
   curl https://signatrust.io/.well-known/mcp-registry-auth
   ```

3. Install the publisher CLI (`brew install mcp-publisher`, or the release binary on Windows), then
   log in with the private key and publish:

   ```bash
   PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
   mcp-publisher login http --domain "signatrust.io" --private-key "${PRIVATE_KEY}"
   mcp-publisher publish
   ```

4. Verify:

   ```bash
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.signatrust/mcp-server"
   ```

## Alternative — DNS-TXT

If HTTP hosting is unavailable, add a TXT record on the `signatrust.io` apex
(`v=MCPv1; k=ed25519; p=<public key>`) and use `mcp-publisher login dns --domain signatrust.io
--private-key "$PRIVATE_KEY"` instead. HTTP is preferred here because the well-known file is
infra-as-code (reviewed + versioned), and it avoids editing apex DNS next to SPF/DMARC/MX.

References: [Publish quickstart](https://modelcontextprotocol.io/registry/quickstart) ·
[Authentication](https://modelcontextprotocol.io/registry/authentication)
