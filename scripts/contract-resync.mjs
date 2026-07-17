// Resync (or verify) the vendored canonical contract snapshot.
//
// Two-tier conformance (Signatrust_v4#2331):
//   Tier 1 — hermetic PR gate: vitest asserts the vendored SDK enums equal the
//            *vendored* copy at contract/agent-contract.json (no network). See
//            src/vendor/signatrust-sdk/contract-conformance.test.ts.
//   Tier 2 — drift alarm (this script, `--check`): fetch the canonical snapshot
//            from live main and diff it against the vendored copy. Runs in CI as
//            a NON-blocking job; it goes red when the backend contract moves.
//
// Answering the alarm is one command: `npm run contract:resync` rewrites the
// vendored copy from live main, then you review + commit the diff.
//
// Exit taxonomy is shared verbatim with mobile-signer's drift alarm so a red
// alarm means the same thing on both consumers:
//   0 in sync · 1 drift · 2 auth/transport · 3 upstream-missing (404).
//
// Signatrust_v4 is a PRIVATE repo, so we fetch through the GitHub Contents API
// (raw.githubusercontent.com won't serve private content even with a token).
// `Accept: application/vnd.github.raw` makes the response body the raw file.
// Auth comes from CONTRACT_READ_TOKEN — a fine-grained PAT with Contents:read
// on Signatrust_v4. Locally: export it in your shell. In CI: the drift job
// reads it from the CONTRACT_READ_TOKEN repo secret.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_URL =
  "https://api.github.com/repos/SignaTrustDev/Signatrust_v4/contents/contract/agent-contract.json?ref=main";
const url = process.env.CONTRACT_SNAPSHOT_URL ?? DEFAULT_URL;

const token = process.env.CONTRACT_READ_TOKEN;
const headers = {
  Accept: "application/vnd.github.raw",
  "User-Agent": "signatrust-mcp-contract-resync",
  "X-GitHub-Api-Version": "2022-11-28",
};
if (token) headers.Authorization = `Bearer ${token}`;

const here = dirname(fileURLToPath(import.meta.url));
const localPath = join(here, "..", "contract", "agent-contract.json");
const checkOnly = process.argv.includes("--check");

// Normalize to canonical 2-space JSON so a formatting-only difference never
// trips the alarm — we only care about semantic drift.
function normalize(text) {
  return JSON.stringify(JSON.parse(text), null, 2) + "\n";
}

const res = await fetch(url, { headers });
if (!res.ok) {
  if (res.status === 404) {
    // Distinct, labeled failure — NOT a skip, and NOT the same as drift (exit 1)
    // or auth/transport errors (exit 2). The snapshot path doesn't exist on the
    // target ref, almost always because the backend contract hasn't been
    // published to main yet (merge-order dependency). The alarm stays RED until
    // upstream lands. GitHub also returns 404 (not 403) for private resources a
    // token can't reach, so a 404 can mask a permissions problem.
    console.error(`✗ UPSTREAM_NOT_PUBLISHED: canonical snapshot not found (HTTP 404) at ${url}.`);
    console.error("  Expected to fail until Signatrust_v4's contract/agent-contract.json is on main,");
    console.error("  or verify CONTRACT_READ_TOKEN has Contents:read if you expected it to exist.");
    process.exit(3);
  }
  console.error(`✗ Failed to fetch canonical contract: HTTP ${res.status} from ${url}`);
  if (res.status === 401 || res.status === 403) {
    console.error("  Auth failed — set CONTRACT_READ_TOKEN to a PAT with Contents:read on Signatrust_v4.");
  }
  process.exit(2);
}

let remote;
try {
  remote = normalize(await res.text());
} catch (err) {
  console.error(`✗ Canonical contract at ${url} is not valid JSON: ${err.message}`);
  process.exit(2);
}

let local = "";
try {
  local = normalize(readFileSync(localPath, "utf8"));
} catch {
  local = ""; // missing/invalid vendored copy → treat as drift
}

if (remote === local) {
  console.log("✓ Vendored contract is in sync with the canonical snapshot.");
  process.exit(0);
}

if (checkOnly) {
  console.error(
    "✗ Vendored contract has drifted from the canonical snapshot on live main.\n" +
      "  Run `npm run contract:resync` and commit the reviewed diff.",
  );
  process.exit(1);
}

writeFileSync(localPath, remote);
console.log(
  `✓ Updated ${localPath} from ${url}.\n  Review the diff and, if enums changed, update src/vendor/signatrust-sdk/types.ts to match.`,
);
