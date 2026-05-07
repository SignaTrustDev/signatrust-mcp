#!/usr/bin/env node
/**
 * Smoke test against the PUBLISHED npm package via npx.
 *
 * Confirms three things:
 *   1. `npx -y @signatrust/mcp-server` downloads + boots the published tarball
 *   2. Without SIGNATRUST_API_KEY, the server exits 1 with a helpful message
 *   3. With a (fake) SIGNATRUST_API_KEY, it acks initialize and lists all 8 tools
 *
 * This proves the README install snippet would actually work in Claude Desktop.
 *
 * Usage:
 *   node scripts/smoke-published.mjs
 */

import { spawn } from "node:child_process";

const PKG = "@signatrust/mcp-server";
const NPX_CMD = process.platform === "win32" ? "npx.cmd" : "npx";

const results = { pass: 0, fail: 0 };
function record(name, outcome, detail) {
  results[outcome]++;
  const tag = outcome === "pass" ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function runProtocol(messages, { env = {}, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(NPX_CMD, ["-y", PKG], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    const responses = [];
    let buf = "";

    child.stdout.on("data", (d) => {
      stdout += d;
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) {
          try {
            responses.push(JSON.parse(line));
          } catch {
            /* ignore non-JSON */
          }
        }
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });

    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ responses, stdout, stderr, exitCode: "TIMEOUT" });
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({ responses, stdout, stderr, exitCode: code });
    });

    for (const msg of messages) {
      child.stdin.write(JSON.stringify(msg) + "\n");
    }
    setTimeout(() => child.stdin.end(), timeoutMs - 1000);
  });
}

console.log(`\n== Smoke test against published ${PKG} ==\n`);

// Test 1 — refuses to start without API key
{
  const r = await runProtocol([], { env: { SIGNATRUST_API_KEY: "" }, timeoutMs: 60000 });
  const ok = r.exitCode === 1 && /SIGNATRUST_API_KEY/.test(r.stderr);
  record(
    "boot: refuses to start without SIGNATRUST_API_KEY",
    ok ? "pass" : "fail",
    ok ? `exit=${r.exitCode}` : `exit=${r.exitCode} stderr=${r.stderr.slice(0, 120)}`,
  );
}

// Test 2 — initialize + tools/list with fake key
{
  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-published", version: "0.0.0" },
    },
  };
  const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
  const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };

  const r = await runProtocol([initialize, initialized, list], {
    env: {
      SIGNATRUST_API_KEY: "sk_fake_smoke_test",
      SIGNATRUST_API_URL: "https://app.signatrust.io",
    },
    timeoutMs: 60000,
  });

  const initResp = r.responses.find((x) => x.id === 1);
  const initOk = initResp?.result?.serverInfo?.name === "signatrust";
  record(
    "boot: acks initialize with serverInfo.name=signatrust",
    initOk ? "pass" : "fail",
    initOk ? "" : `responses=${JSON.stringify(r.responses).slice(0, 200)}`,
  );

  const listResp = r.responses.find((x) => x.id === 2);
  const tools = listResp?.result?.tools?.map((t) => t.name).sort() ?? [];
  const expected = [
    "analyze_document",
    "create_envelope",
    "get_envelope",
    "list_envelopes",
    "list_templates",
    "upload_document",
    "verify_blockchain",
    "void_envelope",
  ];
  const toolsOk = JSON.stringify(tools) === JSON.stringify(expected);
  record(
    "tools/list: returns all 8 tools",
    toolsOk ? "pass" : "fail",
    toolsOk ? `[${tools.join(", ")}]` : `got=[${tools.join(", ")}]`,
  );
}

console.log(`\nResult: ${results.pass} pass, ${results.fail} fail\n`);
process.exit(results.fail > 0 ? 1 : 0);
