/**
 * MCP tool definitions and handlers.
 *
 * The SignaTrust client is injected rather than instantiated at module level
 * so handlers are straightforward to unit test.
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  SignaTrustClient,
  CreateEnvelopeSigner,
  SecurityLevel,
} from "./vendor/signatrust-sdk/index.js";

// =============================================================================
// Tool Definitions
// =============================================================================

export const TOOLS = [
  {
    name: "list_envelopes",
    description:
      "List signature envelopes with optional status filter and pagination. " +
      "Returns envelope summaries including signers, documents, and blockchain " +
      "anchoring status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "SENT", "NEEDS_SIGNATURE", "COMPLETED", "VOIDED", "DECLINED"],
          description: "Filter by envelope status",
        },
        page: {
          type: "number",
          description: "Page number (1-indexed)",
          minimum: 1,
        },
        limit: {
          type: "number",
          enum: [10, 25, 50],
          description: "Results per page (default: 10)",
        },
      },
    },
    annotations: {
      title: "List Envelopes",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "get_envelope",
    description:
      "Get full details of a specific envelope including all signers, " +
      "documents, status, security level, and blockchain anchoring info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID (from list_envelopes or create_envelope)",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Get Envelope Details",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "create_envelope",
    description:
      "Create a new envelope as a DRAFT for review. This does NOT send it — no " +
      "signer is notified. Show the user the draft, and only dispatch it when " +
      "they explicitly confirm, by calling send_envelope. (Sending is legally " +
      "binding and irreversible, so it is deliberately a separate step.) " +
      "Requires a name, at least " +
      "one signer, and at least one document (pass document IDs from " +
      "upload_document, or pass a templateId to create from a template). " +
      "Use " +
      "securityLevel to match the legal weight required: STANDARD for routine/" +
      "internal approvals; VERIFIED (adds SMS/email OTP) for employment, " +
      "vendor, or healthcare consent; CERTIFIED (adds WebAuthn biometric + " +
      "device binding) for real estate, high-value, or regulatory signings. " +
      "Note: each signer needs either an email or a phone, and you must pass " +
      "either documentIds or templateId (not both). " +
      "Examples:\n" +
      "1) Single signer from an uploaded document:\n" +
      '   {"name":"Mutual NDA","signers":[{"name":"Dana Lee","email":"dana@acme.com"}],"documentIds":["doc_abc123"]}\n' +
      "2) Two signers with routing order (Dana first, then Sam by SMS), VERIFIED tier:\n" +
      '   {"name":"Employment Agreement","securityLevel":"VERIFIED","signers":[{"name":"Dana Lee","email":"dana@acme.com","routingOrder":1},{"name":"Sam Ortiz","phone":"+14155550123","deliveryMethod":"SMS","routingOrder":2}],"documentIds":["doc_abc123"]}\n' +
      "3) From a template (omit documentIds — backend copies the template doc), CERTIFIED tier:\n" +
      '   {"name":"Lease Renewal 2026","securityLevel":"CERTIFIED","templateId":"tpl_lease","signers":[{"name":"Pat Singh","email":"pat@example.com"}],"message":"Please review and sign by Friday."}',
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Envelope name/title shown to signers (max 256 chars)",
          maxLength: 256,
        },
        securityLevel: {
          type: "string",
          enum: ["STANDARD", "VERIFIED", "CERTIFIED"],
          description:
            "Signing ceremony tier. STANDARD = bearer-token only (default, " +
            "legally weakest — vulnerable to link-forwarding disputes). " +
            "VERIFIED = STANDARD + SMS/email OTP (defeats link forwarding; " +
            "suitable for employment contracts, vendor agreements, healthcare " +
            "consent). CERTIFIED = VERIFIED + WebAuthn biometric on a " +
            "device-bound credential (near-unrepudiable; suitable for real " +
            "estate, high-value transactions, regulated industries). All " +
            "tiers are included on every plan.",
        },
        signers: {
          type: "array",
          description: "List of signers for this envelope",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Signer's full name",
              },
              email: {
                type: "string",
                description:
                  "Signer's email address (required unless phone is provided)",
              },
              phone: {
                type: "string",
                description:
                  "Signer's phone number for SMS delivery (required unless " +
                  "email is provided)",
              },
              role: {
                type: "string",
                enum: ["SIGNER", "OBSERVER"],
                description:
                  "SIGNER must sign, OBSERVER can only view (default: SIGNER)",
              },
              routingOrder: {
                type: "number",
                description: "Signing order (1 = first, 2 = second, ...)",
                minimum: 1,
              },
              deliveryMethod: {
                type: "string",
                enum: ["EMAIL", "SMS", "BOTH"],
                description: "How to notify signer (default: EMAIL)",
              },
            },
            required: ["name"],
          },
          minItems: 1,
        },
        documentIds: {
          type: "array",
          description:
            "IDs of documents to include. Use upload_document to create a " +
            "document first. Either documentIds or templateId is required.",
          items: { type: "string" },
        },
        templateId: {
          type: "string",
          description:
            "Template ID to create the envelope from. When set, the backend " +
            "copies the template's document server-side — you do not need to " +
            "supply documentIds. Either documentIds or templateId is required.",
        },
        message: {
          type: "string",
          description: "Optional message included in the signing notification",
        },
      },
      required: ["name", "signers"],
    },
    annotations: {
      title: "Create Envelope",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "send_envelope",
    description:
      "⚠️ SEND a DRAFT envelope to its recipients — this dispatches the signing " +
      "invitations, is legally binding, and is irreversible. Only call this after " +
      "the user has reviewed the draft (from create_envelope) and explicitly " +
      "confirmed. It transitions the envelope to SENT and notifies the first " +
      "routing-order signers. " +
      "IMPORTANT: a SENT status does NOT mean recipients were reached. Read the " +
      "`delivery` object in the response and branch on `delivery.state`: " +
      "DELIVERED_ALL (everyone got the invite), DELIVERED_PARTIAL (some did not — " +
      "tell the user who, from `delivery.signers`), DELIVERED_NONE (nobody was " +
      "reached; the envelope is sent but stuck — do not report it as delivered). " +
      "`delivery.detail` is a plain-language summary you can relay.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "ID of the draft envelope to send (from create_envelope)",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Send Envelope",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "list_templates",
    description:
      "List available document templates. Templates provide pre-configured " +
      "documents with defined signer roles and form-field placement.",
    inputSchema: {
      type: "object" as const,
      properties: {
        includeSystem: {
          type: "boolean",
          description:
            "Include system-provided templates alongside user templates " +
            "(default: true)",
        },
      },
    },
    annotations: {
      title: "List Templates",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "upload_document",
    description:
      "Upload a local file to SignaTrust and return a document ID suitable " +
      "for passing to create_envelope. Reads the file from disk, requests a " +
      "pre-signed S3 upload URL, streams the bytes, and returns metadata. " +
      "Supported: PDF (recommended), DOCX, images. Max size is enforced by " +
      "your plan's limits.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file on the local filesystem",
        },
        name: {
          type: "string",
          description:
            "Display name for the document (default: the file's basename)",
        },
        contentType: {
          type: "string",
          description:
            "MIME type (default: inferred from the file extension — .pdf, " +
            ".docx, .png, .jpg, .jpeg are recognised)",
        },
      },
      required: ["filePath"],
    },
    annotations: {
      title: "Upload Document",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "download_document",
    description:
      "Get a time-limited download URL for a document (e.g. the executed/" +
      "signed PDF or an uploaded source file). Returns the document name and a " +
      "pre-signed downloadUrl valid for a limited window (expiresIn seconds) — " +
      "fetch the bytes from that URL directly; it carries its own auth and does " +
      "not need the API key. Pass a document ID from upload_document or from an " +
      "envelope's documents[] (see get_envelope). This is the PDF alone, with " +
      "no audit trail and no signed manifest, so it is not the verifiable " +
      "evidence: for that, use get_evidence_bundle. Requires the documents:read " +
      "scope on your API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: {
          type: "string",
          description:
            "Document ID (from upload_document, or from documents[].id on a " +
            "get_envelope / list_envelopes result)",
        },
      },
      required: ["documentId"],
    },
    annotations: {
      title: "Download Document",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "analyze_document",
    description:
      "Run AI contract analysis on an envelope's document (any status, DRAFT " +
      "included). The document is sent to SignaTrust's servers and analysed " +
      "there by a third-party AI model (Google Gemini), so ask the user for " +
      "explicit consent for THIS document before calling it: SignaTrust's " +
      "policy is that server-side AI on a document needs per-document consent. " +
      "Returns a structured report covering risk assessment, flagged clauses, " +
      "and overall sentiment (SAFE / CAUTION / RISKY). Available on every plan. " +
      "Refused with a 403 when the organization has switched AI processing " +
      "off or is in HIPAA mode; surface that message rather than retrying. " +
      "Each call runs a new, paid AI analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID to analyze",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Analyze Document (AI)",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "void_envelope",
    description:
      "Void (cancel) an in-progress envelope. The envelope's status becomes " +
      "VOIDED, all signers receive a cancellation notice, and the void is " +
      "recorded in the audit trail. Use this when the sender needs to cancel " +
      "a contract that has already been sent to signers. Fails if the envelope " +
      "is already COMPLETED or already VOIDED — use get_envelope first to " +
      "check status. After voiding, the envelope can be deleted via the " +
      "dashboard or DELETE /api/v1/envelopes/{id}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID to void",
        },
        reason: {
          type: "string",
          description:
            "Optional reason for voiding — included in the cancellation " +
            "notice sent to signers, the audit event, and the webhook payload. " +
            "Recommend providing one so signers understand why.",
          maxLength: 500,
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Void Envelope",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "verify_blockchain",
    description:
      "Verify a completed envelope's Solana anchor. Returns the composite " +
      "hash (SHA-256 binding the final PDF, signer metadata, and the " +
      "hash-chained audit trail), the file hash, the Solana transaction ID, " +
      "and an explorer URL. Because the composite hash is anchored to " +
      "Solana, any modification to the document, signer records, or audit " +
      "trail breaks the hash chain and fails verification. This is the " +
      "proof that makes the envelope independently verifiable without " +
      "SignaTrust.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID to verify",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Verify Blockchain Anchor",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "get_evidence",
    description:
      "Get an envelope's evidence record as JSON: the envelope, all signers, " +
      "the hash-chained audit trail (with start/end timestamps), and — when " +
      "the envelope has been anchored — its blockchain verification. This is a " +
      "record to read, not the sealed bundle: it carries no PDF and no signed " +
      "manifest, so a third party cannot verify it on its own. For the " +
      "verifiable artifact, use get_evidence_bundle. Use verify_blockchain when " +
      "you only need the on-chain anchor. Requires the envelopes:read scope on " +
      "your API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID to get the evidence record for",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Get Evidence Record",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "get_evidence_bundle",
    description:
      "Get a download link for a completed envelope's sealed evidence bundle: " +
      "a ZIP holding the final signed PDF, the signer records and the " +
      "hash-chained audit trail, with a manifest signed by SignaTrust's " +
      "published key (listed at https://www.signatrust.io/trust/keys). Returns " +
      "url, expiresAt, sha256 (of the ZIP bytes), sizeBytes and " +
      "signingKeyFingerprint. The link works ONCE and expires after 15 " +
      "minutes: fetch it with a plain HTTP GET (no auth header) straight to a " +
      "file, and do not pass the ZIP's bytes through the conversation. Check " +
      "the file's SHA-256 against sha256, then verify it at " +
      "https://www.signatrust.io/verify. Refused with HTTP 409 and a code: " +
      "ENVELOPE_NOT_COMPLETED; BLIND_CUSTODY (SignaTrust's servers cannot open " +
      "a blind-custody document, so the bundle is assembled in the SignaTrust " +
      "web app); DOCUMENT_DESTROYED (the signed document was destroyed after " +
      "delivery; use get_evidence and verify_blockchain instead). Requires the " +
      "envelopes:read scope on your API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "ID of a COMPLETED envelope",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Get Evidence Bundle (download link)",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
];

// =============================================================================
// Helpers
// =============================================================================

type ToolArgs = Record<string, unknown>;

function success(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
};

function inferContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}

// =============================================================================
// Handler
// =============================================================================

export async function handleTool(
  client: SignaTrustClient,
  name: string,
  args: ToolArgs,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  switch (name) {
    case "list_envelopes": {
      const result = await client.listEnvelopes({
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return success(result);
    }

    case "get_envelope": {
      const result = await client.getEnvelope(args.envelopeId as string);
      return success(result);
    }

    case "create_envelope": {
      // Always a DRAFT: the assistant cannot send at the prompt level. The
      // server enforces that a DRAFT notifies no one; dispatch is the separate,
      // explicit send_envelope step after the user reviews.
      const result = await client.createEnvelope({
        name: args.name as string,
        signers: args.signers as CreateEnvelopeSigner[],
        documentIds: args.documentIds as string[] | undefined,
        templateId: args.templateId as string | undefined,
        message: args.message as string | undefined,
        securityLevel: args.securityLevel as SecurityLevel | undefined,
        draft: true,
      });
      return success(result);
    }

    case "send_envelope": {
      const result = await client.sendEnvelope(args.envelopeId as string);
      return success(result);
    }

    case "list_templates": {
      const result = await client.listTemplates({
        includeSystem: args.includeSystem as boolean | undefined,
      });
      return success(result);
    }

    case "upload_document": {
      const filePath = args.filePath as string;
      const stats = await stat(filePath);
      const bytes = await readFile(filePath);
      const displayName = (args.name as string | undefined) ?? basename(filePath);
      const contentType =
        (args.contentType as string | undefined) ?? inferContentType(filePath);

      const uploaded = await client.requestDocumentUpload({
        name: displayName,
        contentType,
        size: stats.size,
      });

      await client.putBytesToUploadUrl(uploaded.uploadUrl, bytes, contentType);

      return success({
        id: uploaded.id,
        name: uploaded.name,
        contentType: uploaded.contentType,
        size: uploaded.size,
        hash: uploaded.hash,
        createdAt: uploaded.createdAt,
      });
    }

    case "download_document": {
      const result = await client.downloadDocument(args.documentId as string);
      return success(result);
    }

    case "analyze_document": {
      const result = await client.analyzeEnvelope(args.envelopeId as string);
      return success(result);
    }

    case "get_evidence": {
      const result = await client.getEvidence(args.envelopeId as string);
      return success(result);
    }

    case "get_evidence_bundle": {
      const result = await client.getEvidenceBundle(args.envelopeId as string);
      return success(result);
    }

    case "void_envelope": {
      const result = await client.voidEnvelope(args.envelopeId as string, args.reason as string | undefined);
      return success(result);
    }

    case "verify_blockchain": {
      const result = await client.verifyBlockchain(args.envelopeId as string);
      return success(result);
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Use list_tools to see available tools.`,
          },
        ],
        isError: true,
      };
  }
}
