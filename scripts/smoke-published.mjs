#!/usr/bin/env node
/**
 * Smoke test against the PUBLISHED npm package.
 *
 * Installs @signatrust/mcp-server from the public registry into a temp
 * directory and spawns the installed dist/server.js directly via node.
 * This proves that the published tarball, after npm-install, produces a
 * working MCP server.
 *
 * Confirms three things end-to-end:
 *   1. The package installs cleanly from the public registry
 *   2. Without SIGNATRUST_API_KEY, the server exits 1 with a helpful message
 *   3. With a (fake) key, the server acks initialize and lists all 8 tools
 *
 * Why not invoke `npx -y @signatrust/mcp-server` directly?
 * Cross-platform spawning of `npx.cmd` from a Node child_process has
 * Windows-specific quirks (cmd.exe shim resolution + Node 20.12+ security
 * change require shell:true, which then breaks bin resolution differently).
 * Real users invoking npx from a real shell are unaffected — only this
 * test harness was. Spawning the installed dist/server.js directly via
 * node sidesteps the wrapper layer and tests the actual published code.
 *
 * Usage:
 *   node scripts/smoke-published.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PKG = "@signatrust/mcp-server";
const REGISTRY = "https://registry.npmjs.org";
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

const results = { pass: 0, fail: 0 };
function record(name, outcome, detail) {
  results[outcome]++;
  const tag = outcome === "pass" ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log(`\n== Smoke test against published ${PKG} ==\n`);

// Install the package into a temp dir
const tmp = await mkdtemp(join(tmpdir(), "smoke-published-"));
console.log(`  Installing to ${tmp} ...`);
const install = spawnSync(
  NPM_CMD,
  ["install", "--prefix", tmp, "--registry", REGISTRY, `${PKG}@latest`],
  { stdio: "pipe", shell: process.platform === "win32" },
);
if (install.status !== 0) {
  console.log(`  [FAIL] install — exit=${install.status}`);
  console.log(install.stderr?.toString().slice(0, 500));
  process.exit(1);
}

const installedVersion = JSON.parse(
  (
    await import("node:fs").then((fs) =>
      fs.promises.readFile(
        join(tmp, "node_modules", PKG, "package.json"),
        "utf8",
      ),
    )
  ),
).version;
console.log(`  Installed version: ${installedVersion}\n`);

const SERVER_JS = join(tmp, "node_modules", PKG, "dist", "server.js");

async function runProtocol(messages, { env = {}, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER_JS], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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

// Test 1 — refuses to start without API key
{
  // Pass an env with API key cleared. Use a fresh env (not inheriting our shell's)
  // so that any pre-existing SIGNATRUST_API_KEY doesn't leak in.
  const baseEnv = { ...process.env };
  delete baseEnv.SIGNATRUST_API_KEY;
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER_JS], {
      env: baseEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("exit", (code) => resolve({ stderr, exitCode: code }));
    setTimeout(() => child.kill("SIGKILL"), 5000);
  });
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

await rm(tmp, { recursive: true, force: true });

console.log(`\nResult: ${results.pass} pass, ${results.fail} fail\n`);
process.exit(results.fail > 0 ? 1 : 0);
