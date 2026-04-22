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
// =============================================================================

export type EnvelopeStatus =
  | "DRAFT"
  | "SENT"
  | "NEEDS_SIGNATURE"
  | "COMPLETED"
  | "VOIDED"
  | "DECLINED";

export type SignerStatus =
  | "PENDING"
  | "SENT"
  | "NEEDS_SIGNATURE"
  | "SIGNED"
  | "DECLINED";

export type SignerRole = "SIGNER" | "OBSERVER";

export type DeliveryMethod = "EMAIL" | "SMS" | "BOTH";

export type SecurityLevel = "STANDARD" | "VERIFIED" | "CERTIFIED";

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
}
