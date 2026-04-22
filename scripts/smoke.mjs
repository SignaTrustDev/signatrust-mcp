#!/usr/bin/env node
/**
 * SignaTrust MCP smoke test.
 *
 * Exercises the built tools against a real backend. Only runs read-only
 * operations by default so it is safe to run against a production key.
 * Pass --write to also exercise upload_document and (optionally)
 * create_envelope, but see the comments — that path creates real state.
 *
 * Usage:
 *   SIGNATRUST_API_KEY=sk_... SIGNATRUST_API_URL=https://staging.signatrust.io \
 *     node scripts/smoke.mjs
 *   SIGNATRUST_API_KEY=sk_... node scripts/smoke.mjs --write
 */

import { SignaTrustClient } from "../dist/vendor/signatrust-sdk/index.js";
import { handleTool } from "../dist/handlers.js";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_KEY = process.env.SIGNATRUST_API_KEY;
const API_URL = process.env.SIGNATRUST_API_URL || "https://app.signatrust.io";
const WRITE_MODE = process.argv.includes("--write");

if (!API_KEY) {
  console.error("SIGNATRUST_API_KEY is required");
  process.exit(1);
}

const client = new SignaTrustClient({ apiKey: API_KEY, baseUrl: API_URL });

const results = [];
let failed = 0;

async function run(name, fn) {
  process.stdout.write(`• ${name.padEnd(40)} `);
  try {
    const value = await fn();
    console.log("PASS");
    results.push({ name, status: "PASS", value });
    return value;
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    const status = err?.status ? ` [${err.status}]` : "";
    const body = err?.body
      ? ` ${typeof err.body === "string" ? err.body : JSON.stringify(err.body).slice(0, 200)}`
      : "";
    console.log(`FAIL${status} — ${msg}${body}`);
    results.push({ name, status: "FAIL", error: msg });
    return null;
  }
}

async function tool(name, args) {
  const res = await handleTool(client, name, args);
  if (res.isError) {
    const text = res.content?.[0]?.text ?? "(no error text)";
    const err = new Error(text);
    err.mcpError = true;
    throw err;
  }
  return JSON.parse(res.content[0].text);
}

console.log(`SignaTrust MCP smoke test`);
console.log(`  API: ${API_URL}`);
console.log(`  Mode: ${WRITE_MODE ? "READ + WRITE" : "READ-ONLY"}\n`);

// ---------------------------------------------------------------------------
// Read-only checks
// ---------------------------------------------------------------------------

const envelopes = await run("list_envelopes (no filter)", () =>
  tool("list_envelopes", {}),
);

const firstEnvelopeId = envelopes?.data?.[0]?.id;
if (firstEnvelopeId) {
  const envelope = await run(`get_envelope (${firstEnvelopeId})`, () =>
    tool("get_envelope", { id: firstEnvelopeId }),
  );

  // Confirm the response matches the corrected SDK types (not the old ones).
  if (envelope) {
    await run("envelope has v1 shape (name + blockchain.*)", async () => {
      if (typeof envelope.name !== "string") {
        throw new Error(
          `envelope.name missing — response still has old shape? keys: ${Object.keys(envelope).join(",")}`,
        );
      }
      if (!envelope.blockchain || typeof envelope.blockchain !== "object") {
        throw new Error(
          `envelope.blockchain missing — response still has old shape? keys: ${Object.keys(envelope).join(",")}`,
        );
      }
      return { name: envelope.name, blockchain: envelope.blockchain };
    });

    // Only verify_blockchain if the envelope actually has one anchored.
    if (envelope.blockchain?.txId) {
      await run(`verify_blockchain (${firstEnvelopeId})`, () =>
        tool("verify_blockchain", { envelopeId: firstEnvelopeId }),
      );
    } else {
      console.log(
        `• verify_blockchain${" ".repeat(27)} SKIP (no txId on this envelope)`,
      );
    }
  }
} else {
  console.log(
    `• get_envelope${" ".repeat(33)} SKIP (no envelopes on this account)`,
  );
  console.log(
    `• verify_blockchain${" ".repeat(27)} SKIP (no envelope to verify)`,
  );
}

const templates = await run("list_templates", () =>
  tool("list_templates", { includeSystem: true }),
);

const firstTemplateId = templates?.[0]?.id;
if (!firstTemplateId) {
  console.log(
    `• template response has v1 shape${" ".repeat(12)} SKIP (no templates)`,
  );
} else {
  await run("template has v1 shape (vertical + tags)", async () => {
    const tpl = templates[0];
    if (!("tags" in tpl) || !("vertical" in tpl)) {
      throw new Error(
        `template response missing v1 fields — keys: ${Object.keys(tpl).join(",")}`,
      );
    }
    return { id: tpl.id, tags: tpl.tags };
  });
}

// ---------------------------------------------------------------------------
// Write-mode checks (opt-in; --write)
// ---------------------------------------------------------------------------

if (WRITE_MODE) {
  const tmp = await mkdtemp(join(tmpdir(), "sig-smoke-"));
  const pdfPath = join(tmp, "smoke-test.pdf");
  // A minimum-valid PDF would be ideal, but for upload-URL smoke we only need
  // something with a size > 0 and a PDF-like extension.
  await writeFile(
    pdfPath,
    "%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n",
  );

  const uploaded = await run("upload_document (PDF)", () =>
    tool("upload_document", { filePath: pdfPath }),
  );

  await rm(tmp, { recursive: true, force: true });

  if (uploaded?.id) {
    console.log(
      `\nNote: upload_document created a real document (id=${uploaded.id}).`,
    );
    console.log(
      `      Create an envelope with it manually if you want to test the full flow,`,
    );
    console.log(
      `      or delete it via the dashboard. Smoke does not auto-create envelopes.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("");
console.log(
  `Result: ${results.filter((r) => r.status === "PASS").length} passed, ${failed} failed`,
);

if (failed > 0) {
  process.exit(1);
}

console.log(
  "\nManual checks (not automated — would create real state on your account):",
);
console.log(
  "  • create_envelope (templateId or documentIds) — pick a template, send to yourself",
);
console.log(
  "  • analyze_document — run against a completed envelope (plan-gated; Free = 403)",
);
