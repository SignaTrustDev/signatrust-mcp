import { describe, it, expect } from "vitest";
import { formatApiError } from "./errors.js";

describe("formatApiError", () => {
  it("should return isError: true for all responses", () => {
    const result = formatApiError(500);
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("should format 400 with detail from ProblemDetails body", () => {
    const result = formatApiError(400, {
      type: "https://signatrust.io/problems/bad-request",
      title: "Bad Request",
      status: 400,
      detail: "Subject is required",
    });
    expect(result.content[0].text).toBe("Subject is required");
  });

  it("should format 400 with default message when no detail", () => {
    const result = formatApiError(400);
    expect(result.content[0].text).toBe(
      "Bad request. Check your input parameters.",
    );
  });

  it("should format 401 with API key guidance", () => {
    const result = formatApiError(401);
    expect(result.content[0].text).toContain("SIGNATRUST_API_KEY");
  });

  it("should format 403 with detail from body", () => {
    const result = formatApiError(403, {
      type: "https://signatrust.io/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "API key lacks scope: envelopes:write",
    });
    expect(result.content[0].text).toBe(
      "API key lacks scope: envelopes:write",
    );
  });

  it("should format 403 with default message when no detail", () => {
    const result = formatApiError(403);
    expect(result.content[0].text).toContain("scope");
  });

  it("should format 404 with detail", () => {
    const result = formatApiError(404, {
      type: "https://signatrust.io/problems/not-found",
      title: "Not Found",
      status: 404,
      detail: "Envelope not found",
    });
    expect(result.content[0].text).toBe("Envelope not found");
  });

  it("should format 404 with default message", () => {
    const result = formatApiError(404);
    expect(result.content[0].text).toBe("Resource not found.");
  });

  it("should format 409 with detail", () => {
    const result = formatApiError(409, {
      type: "https://signatrust.io/problems/conflict",
      title: "Conflict",
      status: 409,
      detail: "Envelope already sent",
    });
    expect(result.content[0].text).toBe("Envelope already sent");
  });

  it("should format 429 with retryAfter", () => {
    const result = formatApiError(429, null, "30");
    expect(result.content[0].text).toContain("Rate limited");
    expect(result.content[0].text).toContain("30s");
  });

  it("should format 429 without retryAfter", () => {
    const result = formatApiError(429);
    expect(result.content[0].text).toContain("Rate limited");
    expect(result.content[0].text).not.toContain("Retry after");
  });

  it("should format 500 with default message", () => {
    const result = formatApiError(500);
    expect(result.content[0].text).toContain("Internal server error");
  });

  it("should format 503 with default message", () => {
    const result = formatApiError(503);
    expect(result.content[0].text).toContain("Service unavailable");
  });

  it("should format unknown status code", () => {
    const result = formatApiError(418);
    expect(result.content[0].text).toContain("418");
  });

  it("should handle string body", () => {
    const result = formatApiError(400, "Something went wrong");
    expect(result.content[0].text).toBe("Something went wrong");
  });

  it("should use title when detail is missing from ProblemDetails", () => {
    const result = formatApiError(400, {
      type: "https://signatrust.io/problems/bad-request",
      title: "Validation Failed",
      status: 400,
    });
    expect(result.content[0].text).toBe("Validation Failed");
  });
});
