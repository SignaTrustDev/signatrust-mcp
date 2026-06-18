/**
 * HTTP client for the SignaTrust REST API (v1).
 *
 * Vendored from @signatrustdev/signatrust-sdk. Uses native fetch() (Node 18+)
 * with API key authentication via x-api-key header. All methods return typed
 * responses or throw ApiError on non-2xx status.
 */

import type {
  EnvelopeDetail,
  CreateEnvelopeInput,
  TemplateResponse,
  VerificationResponse,
  AnalysisResponse,
  DocumentUploadResponse,
  DocumentDownloadResponse,
  EvidenceBundleResponse,
  PaginatedResponse,
  ProblemDetails,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  /**
   * Optional extra headers added to every API request. Useful for
   * preview/staging deployments gated by a platform auth layer (e.g.
   * Vercel's protection bypass). Never used in production.
   */
  extraHeaders?: Record<string, string>;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  retryAfter?: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ProblemDetails | string | null,
    public retryAfter?: string | null,
  ) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

// =============================================================================
// Client
// =============================================================================

export class SignaTrustClient {
  private apiKey: string;
  private baseUrl: string;
  private extraHeaders: Record<string, string>;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.extraHeaders = config.extraHeaders ?? {};
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.extraHeaders,
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const retryAfter = response.headers.get("retry-after");

    if (!response.ok) {
      let body: ProblemDetails | string | null = null;
      try {
        const text = await response.text();
        body = JSON.parse(text) as ProblemDetails;
      } catch {
        // Body wasn't JSON, leave as null
      }
      throw new ApiError(response.status, body, retryAfter);
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data, retryAfter };
  }

  async listEnvelopes(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<EnvelopeDetail>> {
    const { data } = await this.request<PaginatedResponse<EnvelopeDetail>>(
      "GET",
      "/api/v1/envelopes",
      { params },
    );
    return data;
  }

  async getEnvelope(id: string): Promise<EnvelopeDetail> {
    const { data } = await this.request<EnvelopeDetail>(
      "GET",
      `/api/v1/envelopes/${encodeURIComponent(id)}`,
    );
    return data;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeDetail> {
    const { data } = await this.request<EnvelopeDetail>(
      "POST",
      "/api/v1/envelopes",
      { body: input },
    );
    return data;
  }

  async listTemplates(params?: {
    includeSystem?: boolean;
  }): Promise<TemplateResponse[]> {
    const { data } = await this.request<TemplateResponse[]>(
      "GET",
      "/api/v1/templates",
      { params },
    );
    return data;
  }

  /**
   * Request a pre-signed upload URL for a new document.
   * After this returns, PUT the file bytes to `uploadUrl` with the given
   * Content-Type header, then use the returned `id` when creating an envelope.
   */
  async requestDocumentUpload(input: {
    name: string;
    contentType: string;
    size: number;
  }): Promise<DocumentUploadResponse> {
    const { data } = await this.request<DocumentUploadResponse>(
      "POST",
      "/api/v1/documents/upload",
      { body: input },
    );
    return data;
  }

  /**
   * Upload file bytes to a pre-signed S3 URL obtained from requestDocumentUpload.
   * Does not use the API key — the pre-signed URL carries its own auth.
   */
  async putBytesToUploadUrl(
    uploadUrl: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Pre-signed upload failed: ${response.statusText}`,
        null,
      );
    }
  }

  /**
   * Void an in-progress envelope. Sets status to VOIDED, notifies signers
   * with a cancellation notice, writes an ENVELOPE_VOIDED audit event, and
   * dispatches an `envelope.voided` webhook.
   *
   * Fails with 400 if the envelope is already COMPLETED or already VOIDED.
   */
  async voidEnvelope(
    envelopeId: string,
    reason?: string,
  ): Promise<EnvelopeDetail> {
    const { data } = await this.request<EnvelopeDetail>(
      "POST",
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/void`,
      { body: reason ? { reason } : {} },
    );
    return data;
  }

  /**
   * Get a short-lived pre-signed download URL for a document. The caller
   * fetches the bytes from `downloadUrl` directly (no API key needed there).
   * Requires the `documents:read` scope.
   */
  async downloadDocument(
    documentId: string,
  ): Promise<DocumentDownloadResponse> {
    const { data } = await this.request<DocumentDownloadResponse>(
      "GET",
      `/api/v1/documents/${encodeURIComponent(documentId)}/download`,
    );
    return data;
  }

  /**
   * Fetch the full evidence bundle for an envelope: envelope, signers, audit
   * trail, and (when anchored) blockchain verification, in one record.
   * Requires the `envelopes:read` scope.
   */
  async getEvidence(envelopeId: string): Promise<EvidenceBundleResponse> {
    const { data } = await this.request<EvidenceBundleResponse>(
      "GET",
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/evidence`,
    );
    return data;
  }

  async verifyBlockchain(envelopeId: string): Promise<VerificationResponse> {
    const { data } = await this.request<VerificationResponse>(
      "GET",
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/blockchain`,
    );
    return data;
  }

  /**
   * Trigger AI contract analysis on an envelope's document.
   * Plan-gated: Free plan returns 403.
   */
  async analyzeEnvelope(envelopeId: string): Promise<AnalysisResponse> {
    const { data } = await this.request<AnalysisResponse>(
      "POST",
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/analyze`,
    );
    return data;
  }
}
