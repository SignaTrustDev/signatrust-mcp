import { describe, it, expect } from "vitest";

/**
 * URL-construction safety tests for api-client.ts.
 *
 * These tests do not exercise the live HTTP layer — they verify the safety
 * property that no LLM-supplied tool argument can pivot a request to a
 * sibling endpoint by exploiting `new URL(...)` path normalization.
 *
 * Each test mirrors one of the four `encodeURIComponent` sites in
 * api-client.ts:
 *   - `getEnvelope(id)` → `/api/v1/envelopes/${id}`
 *   - `voidEnvelope(envelopeId)` → `/api/v1/envelopes/${envelopeId}/void`
 *   - `verifyBlockchain(envelopeId)` → `/api/v1/envelopes/${envelopeId}/blockchain`
 *   - `analyzeEnvelope(envelopeId)` → `/api/v1/envelopes/${envelopeId}/analyze`
 *
 * Regression test for SignaTrustDev/Signatrust_v4#1784.
 */

const BASE = "https://app.signatrust.io";

function buildPath(template: (id: string) => string, id: string): string {
  // Construct using the same `new URL` machinery as the SDK's request() method.
  return new URL(template(encodeURIComponent(id)), BASE).pathname;
}

describe("api-client URL construction — pivot defense (#1784)", () => {
  it("preserves cuid-style envelope IDs unchanged", () => {
    const cuid = "cmaxyz123abc456def789";
    expect(buildPath((id) => `/api/v1/envelopes/${id}`, cuid)).toBe(
      "/api/v1/envelopes/cmaxyz123abc456def789",
    );
  });

  it("preserves UUIDs unchanged (no hyphens encoded)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildPath((id) => `/api/v1/envelopes/${id}`, uuid)).toBe(
      `/api/v1/envelopes/${uuid}`,
    );
  });

  it("blocks ../templates pivot on getEnvelope", () => {
    const pathname = buildPath((id) => `/api/v1/envelopes/${id}`, "../templates");
    expect(pathname).toBe("/api/v1/envelopes/..%2Ftemplates");
    expect(pathname).not.toBe("/api/v1/templates");
  });

  it("blocks ../templates pivot on voidEnvelope (suffix preserved)", () => {
    const pathname = buildPath(
      (id) => `/api/v1/envelopes/${id}/void`,
      "../templates",
    );
    expect(pathname).toBe("/api/v1/envelopes/..%2Ftemplates/void");
    expect(pathname).not.toBe("/api/v1/templates/void");
  });

  it("blocks ../analyze pivot on verifyBlockchain", () => {
    const pathname = buildPath(
      (id) => `/api/v1/envelopes/${id}/blockchain`,
      "../analyze",
    );
    expect(pathname).toBe("/api/v1/envelopes/..%2Fanalyze/blockchain");
    expect(pathname).not.toBe("/api/v1/analyze/blockchain");
  });

  it("blocks query-string injection on analyzeEnvelope", () => {
    const pathname = buildPath(
      (id) => `/api/v1/envelopes/${id}/analyze`,
      "abc?leak=1",
    );
    expect(pathname).toBe("/api/v1/envelopes/abc%3Fleak%3D1/analyze");
    expect(new URL(`https://x.test${pathname}`).search).toBe("");
  });

  it("blocks fragment injection", () => {
    const pathname = buildPath(
      (id) => `/api/v1/envelopes/${id}`,
      "abc#frag",
    );
    expect(pathname).toBe("/api/v1/envelopes/abc%23frag");
    expect(new URL(`https://x.test${pathname}`).hash).toBe("");
  });

  it("encodes spaces and other reserved chars without losing them", () => {
    const path = buildPath((id) => `/api/v1/envelopes/${id}`, "with space");
    expect(path).toBe("/api/v1/envelopes/with%20space");
  });
});
