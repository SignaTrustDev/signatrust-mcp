/**
 * Standalone type definitions for the SignaTrust public API (v1).
 *
 * Vendored from @signatrustdev/signatrust-sdk and corrected to match the
 * actual backend response shapes in signatrust_new/src/types/api-v1.ts.
 * This package has no external runtime dependencies beyond
 * @modelcontextprotocol/sdk.
 */

// =============================================================================
// Enums
//
// Each enum is defined ONCE as a runtime tuple; the type is derived from it.
// contract-conformance.test.ts asserts these tuples equal the canonical
// contract/agent-contract.json (synced from signatrust_new). A backend enum
// change the SDK hasn't picked up turns that test red instead of shipping a
// consumer that can't name a state an envelope is actually in.
// =============================================================================

export const ENVELOPE_STATUSES = [
  "DRAFT",
  "SENT",
  "NEEDS_SIGNATURE",
  "AWAITING_ENCRYPTION",
  "COMPLETED",
  "VOIDED",
  "DECLINED",
  "NEEDS_REVISION",
  "PENDING_PRINCIPAL_APPROVAL",
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const SIGNER_STATUSES = ["PENDING", "SENT", "VIEWED", "SIGNED", "DECLINED"] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNER_ROLES = ["SIGNER", "OBSERVER"] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export const DELIVERY_METHODS = ["EMAIL", "SMS", "BOTH", "WHATSAPP"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const SECURITY_LEVELS = ["STANDARD", "VERIFIED", "CERTIFIED"] as const;
export type SecurityLevel = (typeof SECURITY_LEVELS)[number];

// =============================================================================
// RFC 7807 Problem Details
// =============================================================================

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

// =============================================================================
// Pagination
// =============================================================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// =============================================================================
// Envelope
// =============================================================================

export interface EnvelopeSigner {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: SignerRole;
  status: SignerStatus;
  routingOrder: number;
  deliveryMethod: DeliveryMethod;
  signedAt: string | null;
  viewedAt: string | null;
  declinedAt: string | null;
}

export interface EnvelopeDocument {
  id: string;
  name: string;
  contentType: string;
  size: number;
  hash: string | null;
  createdAt: string;
}

/**
 * Envelope shape returned by list / get / create / update.
 * Matches V1EnvelopeDetailResponse in the backend.
 */
export interface EnvelopeDetail {
  id: string;
  name: string;
  status: EnvelopeStatus;
  securityLevel?: SecurityLevel;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  blockchain: {
    txId: string | null;
    network: string | null;
    explorerUrl: string | null;
    timestamp: string | null;
  };
  documents: EnvelopeDocument[];
  signers: EnvelopeSigner[];
}

// =============================================================================
// Template
// =============================================================================

export interface SignerRoleDef {
  role: string;
  order: number;
  action: string;
}

/**
 * Template summary returned by GET /api/v1/templates (list).
 */
export interface TemplateResponse {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  vertical: string | null;
  tags: string[];
  contentType: string;
  fieldCount: number;
  signerRoles: SignerRoleDef[];
  featured: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Document
// =============================================================================

/**
 * Response from POST /api/v1/documents/upload.
 * Caller PUTs file bytes to uploadUrl before using the document in an envelope.
 */
export interface DocumentUploadResponse {
  id: string;
  name: string;
  contentType: string;
  size: number;
  hash: string | null;
  createdAt: string;
  uploadUrl: string;
}

/**
 * Response from GET /api/v1/documents/{id}/download.
 * `downloadUrl` is a short-lived pre-signed URL (valid for `expiresIn` seconds).
 */
export interface DocumentDownloadResponse {
  id: string;
  name: string;
  downloadUrl: string;
  expiresIn: number;
}

// =============================================================================
// Verification
// =============================================================================

/**
 * Response from GET /api/v1/envelopes/{id}/blockchain.
 *
 * compositeHash and fileHash bind document + signer metadata + audit trail.
 * The Solana txId anchors compositeHash publicly and immutably.
 */
export interface VerificationResponse {
  envelopeId: string;
  txId: string | null;
  network: string | null;
  explorerUrl: string | null;
  compositeHash: string | null;
  fileHash: string | null;
  hashVersion: number | null;
  verified: boolean;
  timestamp: number | null;
}

// =============================================================================
// Evidence Bundle
// =============================================================================

/**
 * Evidence record from GET /api/v1/envelopes/{id}/evidence, as JSON.
 *
 * The envelope, its signers, the full audit trail, and (when anchored) the
 * blockchain verification in one record. It carries no PDF and no signed
 * manifest, so it is not the verifiable artifact: for that, see
 * EvidenceBundleLinkResponse. The nested envelope/signer/audit-event objects are
 * passed through verbatim from the backend.
 */
export interface EvidenceBundle {
  envelope: Record<string, unknown>;
  signers: Record<string, unknown>[];
  auditTrail: {
    events: Record<string, unknown>[];
    startTime: string;
    endTime: string;
  };
  blockchainVerification?: VerificationResponse;
}

export interface EvidenceBundleResponse {
  bundle: EvidenceBundle;
}

/**
 * Response from GET /api/v1/envelopes/{id}/evidence/bundle: a single-use link to
 * the sealed evidence bundle ZIP (the signed PDF, signer records and audit trail,
 * with a manifest signed by SignaTrust's published key).
 *
 * `sha256` is the SHA-256 of the exact bytes the link serves. The link works
 * once and expires at `expiresAt`. In HIPAA mode the API returns only
 * `envelopeId`, `url`, `expiresAt`, `sha256` and `signingKeyFingerprint`.
 */
export interface EvidenceBundleLinkResponse {
  envelopeId: string;
  url: string;
  expiresAt: string;
  sha256: string;
  signingKeyFingerprint: string;
  sizeBytes?: number;
  filename?: string;
  singleUse?: true;
}

/**
 * The `code` on a 409 from GET /api/v1/envelopes/{id}/evidence/bundle
 * (V1EvidenceBundleRefusalCode in contract/agent-contract.json).
 */
export const EVIDENCE_BUNDLE_REFUSAL_CODES = ["ENVELOPE_NOT_COMPLETED", "BLIND_CUSTODY", "DOCUMENT_DESTROYED"] as const;
export type EvidenceBundleRefusalCode = (typeof EVIDENCE_BUNDLE_REFUSAL_CODES)[number];

// =============================================================================
// AI Analysis
// =============================================================================

/**
 * Response from POST /api/v1/envelopes/{id}/analyze.
 */
export interface AnalysisResponse {
  envelopeId: string;
  analysis: Record<string, unknown> | null;
  analyzedAt: string | null;
}

// =============================================================================
// Create Envelope Input
// =============================================================================

export interface CreateEnvelopeSigner {
  name: string;
  email?: string;
  phone?: string;
  role?: SignerRole;
  routingOrder?: number;
  deliveryMethod?: DeliveryMethod;
}

/**
 * Body for POST /api/v1/envelopes.
 *
 * Two modes:
 *   - Standard: supply `name`, `signers`, `documentIds`.
 *   - Template: supply `name` (optional, defaults to template name), `signers`,
 *     and `templateId`. Backend copies the template's document server-side.
 */
export interface CreateEnvelopeInput {
  name: string;
  signers: CreateEnvelopeSigner[];
  documentIds?: string[];
  templateId?: string;
  message?: string;
  securityLevel?: SecurityLevel;
  /**
   * When true, the envelope is created as a DRAFT and NOT dispatched — no signer
   * is notified. The MCP `create_envelope` tool always sets this so the assistant
   * cannot send at the prompt level; dispatch is a separate, explicit
   * `send_envelope` step. Default (false) is create-and-send.
   */
  draft?: boolean;
}
