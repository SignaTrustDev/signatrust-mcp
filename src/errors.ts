/**
 * Error formatting for MCP tool responses.
 *
 * Maps HTTP status codes and RFC 7807 ProblemDetails bodies into MCP error
 * content. Sanitizes detail strings to prevent internal information
 * (stack traces, file paths, request IDs) from leaking to the LLM client.
 */

import type { ProblemDetails } from "./vendor/signatrust-sdk/index.js";

export interface McpErrorContent {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

const MAX_DETAIL_LENGTH = 300;

/**
 * Strip content that looks like leaked internals (stack traces, file paths,
 * AWS-style request IDs) and cap length. Applied to 4xx detail strings.
 * 5xx details are discarded entirely.
 */
function sanitizeDetail(detail: string): string {
  let clean = detail
    // Stack-trace lines like "    at Foo.bar (/some/path.ts:42:7)"
    .replace(/^\s*at\s+.*$/gm, "")
    // Absolute Unix paths inside node_modules
    .replace(/\/[\w.-]+\/node_modules\/[\S]+/g, "[path]")
    // Absolute Windows paths
    .replace(/[A-Za-z]:\\[\S]+/g, "[path]")
    // AWS request-id / x-amz-request-id patterns (32+ hex chars)
    .replace(/[A-F0-9]{32,}/gi, "[request-id]")
    // Collapse whitespace runs
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > MAX_DETAIL_LENGTH) {
    clean = clean.slice(0, MAX_DETAIL_LENGTH) + "…";
  }
  return clean;
}

function extractDetail(
  body: ProblemDetails | string | null | undefined,
): string | undefined {
  const raw =
    typeof body === "string"
      ? body
      : body?.detail ?? body?.title ?? undefined;
  if (!raw) return undefined;
  const sanitized = sanitizeDetail(raw);
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Format an API error into an MCP-friendly error response.
 */
export function formatApiError(
  status: number,
  body?: ProblemDetails | string | null,
  retryAfter?: string | null,
): McpErrorContent {
  const detail = extractDetail(body);

  let message: string;

  switch (status) {
    case 400:
      message = detail ?? "Bad request. Check your input parameters.";
      break;
    case 401:
      message =
        "Authentication failed. Check your SIGNATRUST_API_KEY environment variable.";
      break;
    case 403:
      message =
        detail ??
        "Forbidden. Your API key may lack the required scope for this operation.";
      break;
    case 404:
      message = detail ?? "Resource not found.";
      break;
    case 409:
      message = detail ?? "Conflict. The resource may already exist.";
      break;
    case 429: {
      const wait = retryAfter ? ` Retry after ${retryAfter}s.` : "";
      message = `Rate limited.${wait} Please wait before making more requests.`;
      break;
    }
    case 500:
      message =
        "Internal server error. The SignaTrust API encountered an unexpected error. If this persists, contact support at https://github.com/SignaTrustDev/signatrust-mcp/issues.";
      break;
    case 503:
      message =
        "Service unavailable. The SignaTrust API is temporarily down. Retry in a few moments.";
      break;
    default:
      message = detail ?? `Request failed with status ${status}.`;
  }

  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
