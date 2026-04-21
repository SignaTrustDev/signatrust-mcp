/**
 * HTTP client for the SignaTrust REST API.
 *
 * Vendored from @signatrustdev/signatrust-sdk. Uses native fetch() (Node 18+)
 * with API key authentication via x-api-key header. All methods return typed
 * responses or throw on non-2xx status.
 */

import type {
  EnvelopeDetail,
  CreateEnvelopeInput,
  CreateDocumentResponse,
  TemplateResponse,
  VerificationResponse,
  PaginatedResponse,
  ProblemDetails,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
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

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
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
      `/api/v1/envelopes/${id}`,
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

  async voidEnvelope(
    id: string,
    voidReason?: string,
  ): Promise<EnvelopeDetail> {
    const { data } = await this.request<EnvelopeDetail>(
      "PATCH",
      `/api/v1/envelopes/${id}`,
      { body: { status: "VOIDED", voidReason } },
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

  async getTemplate(id: string): Promise<TemplateResponse> {
    const { data } = await this.request<TemplateResponse>(
      "GET",
      `/api/v1/templates/${id}`,
    );
    return data;
  }

  async createDocument(input: {
    fileName: string;
    fileType: string;
    s3Key?: string;
  }): Promise<CreateDocumentResponse> {
    const { data } = await this.request<CreateDocumentResponse>(
      "POST",
      "/api/v1/documents",
      { body: input },
    );
    return data;
  }

  async verifyBlockchain(envelopeId: string): Promise<VerificationResponse> {
    const { data } = await this.request<VerificationResponse>(
      "GET",
      `/api/v1/envelopes/${envelopeId}/blockchain`,
    );
    return data;
  }
}
