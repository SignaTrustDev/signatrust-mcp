# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this MCP server, please report it privately rather than filing a public issue.

- **Email:** admin@signatrust.io
- **Expected initial response:** within 72 hours
- **Coordinated disclosure:** we will work with you on a fix and disclosure timeline before any public advisory.

For sensitive reports, please request a PGP key in your initial email and we will provide one.

## Scope

**In scope**

- This MCP server (`@signatrust/mcp-server`)
- The vendored SignaTrust SDK under `src/vendor/signatrust-sdk/`
- The published MCPB bundle (`signatrust.mcpb`)

**Out of scope**

- The SignaTrust API backend — report via https://signatrust.io/security
- Third-party dependencies — please report directly to those projects (we will track and pull patched versions)
- Issues requiring physical access to a user's machine, social engineering, or compromised credentials

## Supported Versions

Only the latest published version on npm receives security updates. Users on older versions should upgrade to receive fixes.

## Hall of Fame

Researchers who report valid vulnerabilities through this process will be credited (with permission) in release notes.
