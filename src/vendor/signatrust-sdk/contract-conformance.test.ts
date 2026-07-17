import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  ENVELOPE_STATUSES,
  SIGNER_STATUSES,
  SIGNER_ROLES,
  DELIVERY_METHODS,
  SECURITY_LEVELS,
} from "./types.js";

// The canonical contract, synced from signatrust_new (contract/agent-contract.json).
// Regenerated there by `npm run contract:snapshot`; copied here on sync. See
// signatrust_new issue #2331 for the exposure-curation follow-up.
interface ContractSnapshot {
  enums: Record<string, string[]>;
}

const snapshot: ContractSnapshot = JSON.parse(
  readFileSync(join(process.cwd(), "contract", "agent-contract.json"), "utf8"),
);

// Local SDK enum tuple -> the snapshot key it must equal.
const CASES: Array<[string, readonly string[]]> = [
  ["EnvelopeStatus", ENVELOPE_STATUSES],
  ["SignerStatus", SIGNER_STATUSES],
  ["SignerRole", SIGNER_ROLES],
  ["DeliveryMethod", DELIVERY_METHODS],
  ["SecurityLevel", SECURITY_LEVELS],
];

describe("SDK enum conformance to the canonical contract", () => {
  it.each(CASES)("should keep %s in sync with contract/agent-contract.json", (name, tuple) => {
    // Order-independent: a switch cares about membership, not declaration order.
    // A mismatch means the backend enum changed and this vendored copy is stale —
    // resync from signatrust_new, do not edit the numbers to force green.
    expect([...tuple].sort()).toEqual([...snapshot.enums[name]].sort());
  });
});
