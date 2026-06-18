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
    },
  },
  {
    name: "create_envelope",
    description:
      "Create and send a new envelope for signing. Requires a name, at least " +
      "one signer, and at least one document (pass document IDs from " +
      "upload_document, or pass a templateId to create from a template). " +
      "Signers are notified via their chosen delivery method. Use " +
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
      "envelope's documents[] (see get_envelope). Requires the documents:read " +
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
    },
  },
  {
    name: "analyze_document",
    description:
      "Run AI contract analysis (Google Gemini) on a completed envelope's " +
      "document. Returns a structured report covering risk assessment, " +
      "flagged clauses, and overall sentiment (SAFE / CAUTION / RISKY). " +
      "Plan-gated: free accounts receive a 403; upgrade to Pro Lite or above " +
      "to use this. Surface the 403 message to the user rather than retrying.",
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
      readOnlyHint: true,
      destructiveHint: false,
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
    },
  },
  {
    name: "get_evidence",
    description:
      "Get the full evidence bundle for an envelope in a single record: the " +
      "envelope, all signers, the complete hash-chained audit trail (with " +
      "start/end timestamps), and — when the envelope has been anchored — its " +
      "blockchain verification. This is the court-ready, self-contained proof " +
      "of the signing: retain it or hand it to a third party who can verify " +
      "the signing independently. Use verify_blockchain instead when you only " +
      "need the on-chain anchor; use this when you need the whole record. " +
      "Requires the envelopes:read scope on your API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        envelopeId: {
          type: "string",
          description: "Envelope ID to build the evidence bundle for",
        },
      },
      required: ["envelopeId"],
    },
    annotations: {
      title: "Get Evidence Bundle",
      readOnlyHint: true,
      destructiveHint: false,
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
      const result = await client.createEnvelope({
        name: args.name as string,
        signers: args.signers as CreateEnvelopeSigner[],
        documentIds: args.documentIds as string[] | undefined,
        templateId: args.templateId as string | undefined,
        message: args.message as string | undefined,
        securityLevel: args.securityLevel as SecurityLevel | undefined,
      });
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
