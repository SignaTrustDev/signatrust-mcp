/**
 * Standalone type definitions for the SignaTrust API.
 *
 * Vendored from @signatrustdev/signatrust-sdk so this package has no
 * external runtime dependencies beyond @modelcontextprotocol/sdk.
 */

// =============================================================================
// Enums
// =============================================================================

export type EnvelopeStatus =
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
  signedAt?: string | null;
}

export interface EnvelopeDocument {
  id: string;
  name: string;
  s3Key: string;
  mimeType: string;
  hash: string | null;
  url?: string;
}

export interface EnvelopeDetail {
  id: string;
  subject: string;
  status: EnvelopeStatus;
  securityLevel?: SecurityLevel;
  senderEmail: string;
  senderName: string | null;
  createdAt: string;
  updatedAt: string;
  blockchainTxId: string | null;
  blockchainNetwork: string | null;
  blockchainExplorerUrl: string | null;
  signers: EnvelopeSigner[];
  documents: EnvelopeDocument[];
}

// =============================================================================
// Template
// =============================================================================

export interface TemplateResponse {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  documentName: string;
  documentUrl?: string;
  contentType: string;
  fields: unknown | null;
  signerRoles: unknown | null;
  isSystem: boolean;
  userId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Document
// =============================================================================

export interface CreateDocumentResponse {
  id: string;
  name: string;
  s3Key: string;
  contentType: string;
  size: number;
  hash: string | null;
  envelopeId: string | null;
  createdAt: string;
  uploadUrl?: string;
  url?: string;
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
  hashVersion: string | null;
  verified: boolean;
  timestamp: number | null;
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

export interface CreateEnvelopeInput {
  subject: string;
  signers: CreateEnvelopeSigner[];
  documentIds: string[];
  message?: string;
  securityLevel?: SecurityLevel;
}
