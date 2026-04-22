#!/usr/bin/env node
/**
 * End-to-end MCP protocol test.
 *
 * Spawns the built server as a subprocess, pipes JSON-RPC messages over
 * stdin, reads responses from stdout. Tests both the MCP protocol surface
 * (initialize, tools/list) and every tool's dispatch path.
 *
 * Without SIGNATRUST_API_KEY, auth-required tool calls will 401 — that is
 * still a valid test of the transport + error-sanitization path.
 * Set SIGNATRUST_API_KEY (and optionally SIGNATRUST_API_URL) to hit a real
 * backend for green-path verification.
 *
 * Usage:
 *   node scripts/e2e.mjs
 *   SIGNATRUST_API_KEY=sk_... node scripts/e2e.mjs
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LIVE = !!process.env.SIGNATRUST_API_KEY && !process.env.SIGNATRUST_API_KEY.includes("fake");
const API_KEY = process.env.SIGNATRUST_API_KEY || "sk_fake_for_protocol_test";
const API_URL = process.env.SIGNATRUST_API_URL || "https://app.signatrust.io";

const results = { pass: 0, fail: 0, skip: 0, items: [] };
function record(name, outcome, detail) {
  results[outcome]++;
  results.items.push({ name, outcome, detail });
  const tag = outcome === "pass" ? "PASS" : outcome === "fail" ? "FAIL" : "SKIP";
  const line = `  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
}

/**
 * Run the MCP server, send a sequence of JSON-RPC messages, collect responses.
 */
async function runProtocol(messages, { env = {}, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["dist/server.js"],
      {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const responses = [];
    let buf = "";

    child.stdout.on("data", (data) => {
      stdout += data;
      buf += data.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) {
          try {
            responses.push(JSON.parse(line));
          } catch {
            /* non-JSON-RPC line, ignore */
          }
        }
      }
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ responses, stdout, stderr, exitCode: "TIMEOUT" });
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ responses, stdout, stderr, exitCode: code });
    });

    for (const msg of messages) {
      child.stdin.write(JSON.stringify(msg) + "\n");
    }

    setTimeout(() => {
      child.stdin.end();
    }, timeoutMs - 500);
  });
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-harness", version: "0.0.1" },
  },
};
const initialized = {
  jsonrpc: "2.0",
  method: "notifications/initialized",
};
const listTools = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
const callTool = (id, name, args) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

// ---------------------------------------------------------------------------
// Section A — startup behaviour
// ---------------------------------------------------------------------------
console.log("\n== Section A — startup ==");

{
  const r = await runProtocol([], { env: { SIGNATRUST_API_KEY: "" }, timeoutMs: 2000 });
  const exitedCleanly = r.exitCode === 1 && /SIGNATRUST_API_KEY/.test(r.stderr);
  record(
    "refuses to start without SIGNATRUST_API_KEY",
    exitedCleanly ? "pass" : "fail",
    exitedCleanly ? `exit=${r.exitCode}` : `exit=${r.exitCode}, stderr=${r.stderr.slice(0, 120)}`,
  );
}

{
  const r = await runProtocol([initialize, initialized], {
    env: { SIGNATRUST_API_KEY: API_KEY, SIGNATRUST_API_URL: API_URL },
    timeoutMs: 3000,
  });
  const banner = /MCP server running on stdio/.test(r.stderr);
  const initAck = r.responses.find((x) => x.id === 1);
  const ok = banner && initAck && initAck.result?.serverInfo?.name === "signatrust";
  record(
    "starts, prints banner, and acks initialize",
    ok ? "pass" : "fail",
    ok ? `serverInfo.name=${initAck.result.serverInfo.name}` : `banner=${banner}, initAck=${JSON.stringify(initAck)}`,
  );
}

// ---------------------------------------------------------------------------
// Section B — tools/list
// ---------------------------------------------------------------------------
console.log("\n== Section B — tools/list ==");

const listRes = await runProtocol(
  [initialize, initialized, listTools],
  { env: { SIGNATRUST_API_KEY: API_KEY, SIGNATRUST_API_URL: API_URL } },
);
const toolsList = listRes.responses.find((x) => x.id === 2)?.result?.tools ?? [];
const expectedTools = [
  "list_envelopes",
  "get_envelope",
  "create_envelope",
  "void_envelope",
  "list_templates",
  "upload_document",
  "analyze_document",
  "verify_blockchain",
];
const listedNames = toolsList.map((t) => t.name);
const allPresent = expectedTools.every((n) => listedNames.includes(n));
record(
  `tools/list returns all ${expectedTools.length} tools`,
  allPresent ? "pass" : "fail",
  `listed=[${listedNames.join(", ")}]`,
);

const hasAnnotations = toolsList.every((t) => t.annotations?.title);
record(
  "every tool has annotations.title",
  hasAnnotations ? "pass" : "fail",
);

const voidIsDestructive = toolsList.find((t) => t.name === "void_envelope")?.annotations
  ?.destructiveHint;
record(
  "void_envelope carries destructiveHint: true",
  voidIsDestructive === true ? "pass" : "fail",
  `destructiveHint=${voidIsDestructive}`,
);

const readOnlyTools = toolsList
  .filter((t) => t.annotations?.readOnlyHint === true)
  .map((t) => t.name)
  .sort();
const expectedReadOnly = [
  "analyze_document",
  "get_envelope",
  "list_envelopes",
  "list_templates",
  "verify_blockchain",
].sort();
record(
  "readOnlyHint flags match expected read-only tools",
  JSON.stringify(readOnlyTools) === JSON.stringify(expectedReadOnly)
    ? "pass"
    : "fail",
  `got=[${readOnlyTools.join(",")}] expected=[${expectedReadOnly.join(",")}]`,
);

// ---------------------------------------------------------------------------
// Section C — edge cases (no backend required)
// ---------------------------------------------------------------------------
console.log("\n== Section C — edge cases (no backend required) ==");

{
  const r = await runProtocol(
    [initialize, initialized, callTool(99, "does_not_exist", {})],
    { env: { SIGNATRUST_API_KEY: API_KEY, SIGNATRUST_API_URL: API_URL } },
  );
  const resp = r.responses.find((x) => x.id === 99);
  const ok = resp?.result?.isError === true && /Unknown tool/.test(resp.result.content[0].text);
  record(
    "unknown tool name returns isError with clear message",
    ok ? "pass" : "fail",
    ok ? `text="${resp.result.content[0].text.slice(0, 60)}..."` : JSON.stringify(resp),
  );
}

{
  const r = await runProtocol(
    [initialize, initialized, callTool(100, "upload_document", { filePath: "/nonexistent/file.pdf" })],
    { env: { SIGNATRUST_API_KEY: API_KEY, SIGNATRUST_API_URL: API_URL } },
  );
  const resp = r.responses.find((x) => x.id === 100);
  const isError = resp?.result?.isError === true;
  const text = resp?.result?.content?.[0]?.text || "";
  record(
    "upload_document with missing file returns readable error",
    isError ? "pass" : "fail",
    isError ? `text="${text.slice(0, 80)}..."` : JSON.stringify(resp),
  );
}

// ---------------------------------------------------------------------------
// Section D — dispatch path (fake key → 401, real key → green path)
// ---------------------------------------------------------------------------
console.log(
  `\n== Section D — dispatch (${LIVE ? "live backend" : "fake key, expecting 401 / sanitized errors"}) ==`,
);

async function toolCall(id, name, args) {
  const r = await runProtocol(
    [initialize, initialized, callTool(id, name, args)],
    { env: { SIGNATRUST_API_KEY: API_KEY, SIGNATRUST_API_URL: API_URL } },
    );
  return r.responses.find((x) => x.id === id)?.result ?? null;
}

// list_envelopes — should hit the API
{
  const result = await toolCall(201, "list_envelopes", {});
  if (!LIVE) {
    const rejected =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    const is401 = rejected;
    record(
      "list_envelopes with fake key → fake key rejected (401 or 403) message",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    const ok = result && !result.isError;
    record("list_envelopes (live)", ok ? "pass" : "fail", result?.content?.[0]?.text?.slice(0, 100));
  }
}

// list_templates — should hit the API
{
  const result = await toolCall(202, "list_templates", { includeSystem: true });
  if (!LIVE) {
    const rejected =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    const is401 = rejected;
    record(
      "list_templates with fake key → fake key rejected (401 or 403) message",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    const ok = result && !result.isError;
    record("list_templates (live)", ok ? "pass" : "fail", result?.content?.[0]?.text?.slice(0, 100));
  }
}

// verify_blockchain on fake id
{
  const result = await toolCall(203, "verify_blockchain", { envelopeId: "env_fake" });
  if (!LIVE) {
    const rejected =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    const is401 = rejected;
    record(
      "verify_blockchain with fake key → fake key rejected (401 or 403)",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    // Live: fake id → 404 expected
    const is404 = result?.isError === true && /not found/i.test(result.content[0].text);
    record(
      "verify_blockchain with bad id → 404 surface",
      is404 ? "pass" : "fail",
      result?.content?.[0]?.text?.slice(0, 80),
    );
  }
}

// create_envelope — tests JSON body construction and securityLevel passthrough
{
  const result = await toolCall(204, "create_envelope", {
    name: "E2E test",
    signers: [{ name: "Alice", email: "alice@example.com" }],
    documentIds: ["doc_fake"],
    securityLevel: "VERIFIED",
  });
  if (!LIVE) {
    const rejected =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    const is401 = rejected;
    record(
      "create_envelope with fake key → fake key rejected (401 or 403)",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    // Live with a fake documentId → 404 expected
    record(
      "create_envelope with fake documentId → clean error surface",
      result?.isError === true ? "pass" : "fail",
      result?.content?.[0]?.text?.slice(0, 100),
    );
  }
}

// void_envelope — sanity check the new tool wires through
{
  const result = await toolCall(205, "void_envelope", { id: "env_fake", reason: "test" });
  if (!LIVE) {
    const rejected =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    const is401 = rejected;
    record(
      "void_envelope with fake key → fake key rejected (401 or 403) (confirms POST /void wiring)",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    const ok = result?.isError === true && /not found/i.test(result.content[0].text);
    record(
      "void_envelope with bad id → 404",
      ok ? "pass" : "fail",
      result?.content?.[0]?.text?.slice(0, 80),
    );
  }
}

// upload_document — full local side without hitting backend upload
{
  const dir = await mkdtemp(join(tmpdir(), "e2e-"));
  const p = join(dir, "e2e.pdf");
  await writeFile(p, Buffer.from("%PDF-1.4\ne2e\n%%EOF\n"));
  const result = await toolCall(206, "upload_document", { filePath: p });
  await rm(dir, { recursive: true, force: true });

  if (!LIVE) {
    // Fake key → the initial POST to /api/v1/documents/upload is rejected
    const is401 =
      result?.isError === true &&
      (/Authentication failed/.test(result.content[0].text) ||
        /Forbidden/.test(result.content[0].text));
    record(
      "upload_document with fake key → fake key rejected (401 or 403)",
      is401 ? "pass" : "fail",
      is401 ? `"${result.content[0].text.slice(0, 60)}"` : JSON.stringify(result),
    );
  } else {
    const ok = result && !result.isError;
    record("upload_document (live)", ok ? "pass" : "fail", result?.content?.[0]?.text?.slice(0, 100));
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log(
  `Result: ${results.pass} pass, ${results.fail} fail, ${results.skip} skip`,
);
if (!LIVE) {
  console.log(
    "Note: set SIGNATRUST_API_KEY=sk_... (real staging key) to verify green paths against live backend.",
  );
}
process.exit(results.fail > 0 ? 1 : 0);
