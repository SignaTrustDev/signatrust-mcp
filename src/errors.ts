/**
 * Error formatting for MCP tool responses.
 *
 * Maps HTTP status codes and RFC 7807 ProblemDetails bodies
 * into user-friendly MCP error content.
 */

import type { ProblemDetails } from "@signatrustdev/signatrust-sdk";

export interface McpErrorContent {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

/**
 * Format an API error into an MCP-friendly error response.
 */
export function formatApiError(
  status: number,
  body?: ProblemDetails | string | null,
  retryAfter?: string | null,
): McpErrorContent {
  const detail =
    typeof body === "string"
      ? body
      : body?.detail ?? body?.title ?? undefined;

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
        detail ?? "Internal server error. The SignaTrust API encountered an unexpected error.";
      break;
    case 503:
      message =
        detail ?? "Service unavailable. The SignaTrust API is temporarily down.";
      break;
    default:
      message =
        detail ?? `Request failed with status ${status}.`;
  }

  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
