#!/usr/bin/env node
"use strict";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const msg = [
  "",
  `${RED}${BOLD}signatrust-mcp-server is a redirect stub — not a working server.${RESET}`,
  "",
  `The canonical SignaTrust MCP server is published under a scope:`,
  `  ${CYAN}${BOLD}@signatrust/mcp-server${RESET}`,
  "",
  `Install it instead with:`,
  `  ${YELLOW}npx -y @signatrust/mcp-server${RESET}`,
  "",
  `Documentation: https://github.com/SignaTrustDev/signatrust-mcp`,
  "",
];

for (const line of msg) {
  process.stderr.write(line + "\n");
}

process.exit(1);
