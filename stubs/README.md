# Squat-prevention stub packages

Two redirect-stub packages that sit on the most likely autocomplete errors for the canonical `@signatrust/mcp-server` package on public npm.

| Package | Defends against |
|---|---|
| `@signatrustdev/mcp-server` | "I remember the name had `dev` in it" — recall error |
| `signatrust-mcp-server` (unscoped) | Dropping the scope when copy-pasting |

Each stub is a tiny package whose `bin` script prints a redirect message to stderr and exits with code 1. Anyone who runs `npx -y @signatrustdev/mcp-server` (or the unscoped variant) will see a clear pointer to the canonical name and the install will fail loud rather than silently doing nothing.

## Publishing

Each stub publishes from its own subdirectory. They are deliberately not wired into the main repo's `publish.yml` workflow — they ship rarely (only if the canonical name changes) and there is no value in re-publishing them on every canonical release.

```bash
# After @signatrust/mcp-server@0.1.1 is live:
cd stubs/at-signatrustdev-mcp-server
npm publish --access public

cd ../signatrust-mcp-server
npm publish --access public
```

Both publishes need a 2FA OTP from the npmjs.org account that owns the `@signatrustdev` scope and has rights to claim the unscoped `signatrust-mcp-server` name.

## When to bump

If the canonical package's npm name ever changes, update the redirect target string in each stub's `bin/redirect.cjs` and the README, then bump each stub's version and republish.
