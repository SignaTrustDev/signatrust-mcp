/**
 * Resync this repo's vendored copy of the canonical agent-contract from upstream
 * (signatrust_new). This is the TIER-2 fix action: when the drift-alarm job
 * reports the copy is stale, run `npm run contract:resync` and commit the result.
 *
 * The contract is authored ONLY in signatrust_new (contract/agent-contract.json,
 * generated there by `npm run contract:snapshot`). This script never edits the
 * contract — it only pulls the current upstream version verbatim.
 *
 * Auth: uses the GitHub CLI. Locally that's your `gh auth`; in CI it's the
 * CONTRACT_UPSTREAM_TOKEN secret exported as GH_TOKEN (a token with read access
 * to the private Signatrust_v4 repo — the repo-scoped GITHUB_TOKEN cannot read
 * a different private repo). Without either, this exits non-zero with guidance.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UPSTREAM_REPO = "SignaTrustDev/Signatrust_v4";
const UPSTREAM_PATH = "contract/agent-contract.json";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "contract", "agent-contract.json");

const res = spawnSync(
  "gh",
  ["api", `repos/${UPSTREAM_REPO}/contents/${UPSTREAM_PATH}`, "-H", "Accept: application/vnd.github.raw"],
  { encoding: "utf8" },
);

if (res.error && res.error.code === "ENOENT") {
  console.error("[resync] GitHub CLI (gh) not found. Install it, or run locally where gh is available.");
  process.exit(1);
}
if (res.status !== 0) {
  console.error(
    `[resync] gh could not read ${UPSTREAM_REPO}/${UPSTREAM_PATH}.\n` +
      "  Locally: run `gh auth login`.\n" +
      "  In CI: set the CONTRACT_UPSTREAM_TOKEN secret (read access to the upstream repo) and export it as GH_TOKEN.\n" +
      `  gh said: ${(res.stderr || "").trim()}`,
  );
  process.exit(1);
}

// Validate it parses before overwriting — never write a truncated/garbage copy.
try {
  JSON.parse(res.stdout);
} catch {
  console.error("[resync] upstream response was not valid JSON — refusing to overwrite the local copy.");
  process.exit(1);
}

writeFileSync(outPath, res.stdout.endsWith("\n") ? res.stdout : res.stdout + "\n");
console.log(`[resync] updated ${UPSTREAM_PATH} from ${UPSTREAM_REPO}.`);
