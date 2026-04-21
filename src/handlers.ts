/**
 * MCP tool definitions and handlers.
 *
 * Extracted from server.ts for testability — the client is injected
 * rather than instantiated at module level.
 */

import type { SignaTrustClient, CreateEnvelopeSigner } from "./vendor/signatrust-sdk/index.js";

// =============================================================================
// Tool Definitions
// =============================================================================

export const TOOLS = [
  {
    name: "list_envelopes",
    description:
      "List signature envelopes with optional status filter and pagination. " +
      "Returns envelope summaries including signers, documents, and blockchain anchoring status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["SENT", "NEEDS_SIGNATURE", "COMPLETED", "VOIDED", "DECLINED"],
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
      "documents, status, and blockchain transaction info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Envelope ID",
        },
      },
      required: ["id"],
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
      "Create and send a new envelope for signing. Requires at least one signer " +
      "and one document. Signers are notified via their specified delivery method. " +
      "Use the securityLevel parameter to match the legal weight required: STANDARD " +
      "for routine/internal approvals; VERIFIED (adds SMS/email OTP) for employment, " +
      "vendor, or healthcare consent; CERTIFIED (adds WebAuthn biometric + device " +
      "binding) for real estate, high-value, or regulatory signings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        subject: {
          type: "string",
          description: "Envelope subject/title shown to signers",
        },
        securityLevel: {
          type: "string",
          enum: ["STANDARD", "VERIFIED", "CERTIFIED"],
          description:
            "Signing ceremony tier. STANDARD = bearer-token only (default, " +
            "legally weakest — vulnerable to link-forwarding disputes). VERIFIED = " +
            "STANDARD + SMS/email OTP (defeats link forwarding; suitable for " +
            "employment contracts, vendor agreements, healthcare consent). " +
            "CERTIFIED = VERIFIED + WebAuthn biometric on a device-bound credential " +
            "(near-unrepudiable; suitable for real estate, high-value transactions, " +
            "regulated industries). All tiers are included on every plan.",
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
                description: "Signer's email address",
              },
              phone: {
                type: "string",
                description: "Signer's phone number (for SMS delivery)",
              },
              role: {
                type: "string",
                enum: ["SIGNER", "OBSERVER"],
                description:
                  "SIGNER must sign, OBSERVER can only view (default: SIGNER)",
              },
              routingOrder: {
                type: "number",
                description: "Signing order (1 = first, 2 = second, etc.)",
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
            "IDs of documents to include (create via create_document first)",
          items: { type: "string" },
          minItems: 1,
        },
        message: {
          type: "string",
          description:
            "Optional message to include in the signing notification",
        },
      },
      required: ["subject", "signers", "documentIds"],
    },
    annotations: {
      title: "Create Envelope",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "void_envelope",
    description:
      "Void an active envelope, cancelling all pending signatures. " +
      "All signers are notified that the envelope has been voided.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Envelope ID to void",
        },
        voidReason: {
          type: "string",
          description: "Reason for voiding (shown to signers)",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Void Envelope",
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
  {
    name: "list_templates",
    description:
      "List available document templates. Templates provide pre-configured " +
      "documents with defined signer roles and form fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        includeSystem: {
          type: "boolean",
          description: "Include system-provided templates (default: true)",
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
    name: "create_from_template",
    description:
      "Create a new envelope from a template. This is a 3-step operation: " +
      "fetches the template, creates a document copy, then creates the envelope. " +
      "Use list_templates to find available template IDs. Pick securityLevel to " +
      "match the legal weight required (see create_envelope for tier guidance).",
    inputSchema: {
      type: "object" as const,
      properties: {
        templateId: {
          type: "string",
          description: "Template ID to create from",
        },
        subject: {
          type: "string",
          description: "Envelope subject (defaults to template name)",
        },
        securityLevel: {
          type: "string",
          enum: ["STANDARD", "VERIFIED", "CERTIFIED"],
          description:
            "Signing ceremony tier (default STANDARD). See create_envelope for " +
            "guidance on when to use VERIFIED or CERTIFIED.",
        },
        signers: {
          type: "array",
          description: "Signers for this envelope",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Signer's full name",
              },
              email: {
                type: "string",
                description: "Signer's email address",
              },
              phone: {
                type: "string",
                description: "Signer's phone number",
              },
              role: {
                type: "string",
                enum: ["SIGNER", "OBSERVER"],
                description: "Role (default: SIGNER)",
              },
              routingOrder: {
                type: "number",
                description: "Signing order",
                minimum: 1,
              },
              deliveryMethod: {
                type: "string",
                enum: ["EMAIL", "SMS", "BOTH"],
                description: "Notification method (default: EMAIL)",
              },
            },
            required: ["name"],
          },
          minItems: 1,
        },
        message: {
          type: "string",
          description: "Optional message for signers",
        },
      },
      required: ["templateId", "signers"],
    },
    annotations: {
      title: "Create from Template",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "verify_blockchain",
    description:
      "Verify a completed envelope's Solana anchor. Returns the composite hash " +
      "(SHA-256 binding the final PDF, signer metadata, and the hash-chained " +
      "audit trail), the file hash, the Solana transaction ID, and an explorer " +
      "URL. Because the composite hash is anchored to Solana, any modification " +
      "to the document, signer records, or audit trail would break the hash " +
      "chain and fail verification. This is the proof that makes the envelope " +
      "independently verifiable without SignaTrust.",
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
];

// =============================================================================
// Handler
// =============================================================================

type ToolArgs = Record<string, unknown>;

function success(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

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
      const result = await client.getEnvelope(args.id as string);
      return success(result);
    }

    case "create_envelope": {
      const result = await client.createEnvelope({
        subject: args.subject as string,
        signers: args.signers as CreateEnvelopeSigner[],
        documentIds: args.documentIds as string[],
        message: args.message as string | undefined,
        securityLevel: args.securityLevel as
          | "STANDARD"
          | "VERIFIED"
          | "CERTIFIED"
          | undefined,
      });
      return success(result);
    }

    case "void_envelope": {
      const result = await client.voidEnvelope(
        args.id as string,
        args.voidReason as string | undefined,
      );
      return success(result);
    }

    case "list_templates": {
      const result = await client.listTemplates({
        includeSystem: args.includeSystem as boolean | undefined,
      });
      return success(result);
    }

    case "create_from_template": {
      // Step 1: Get template details
      const template = await client.getTemplate(args.templateId as string);

      // Step 2: Create document from template's S3 key
      const document = await client.createDocument({
        fileName: template.documentName,
        fileType: template.contentType,
        s3Key: template.documentUrl?.split("?")[0],
      });

      // Step 3: Create envelope with the new document
      const envelope = await client.createEnvelope({
        subject: (args.subject as string) || template.name,
        signers: args.signers as CreateEnvelopeSigner[],
        documentIds: [document.id],
        message: args.message as string | undefined,
        securityLevel: args.securityLevel as
          | "STANDARD"
          | "VERIFIED"
          | "CERTIFIED"
          | undefined,
      });

      return success({
        envelope,
        templateUsed: { id: template.id, name: template.name },
        documentCreated: { id: document.id, name: document.name },
      });
    }

    case "verify_blockchain": {
      const result = await client.verifyBlockchain(
        args.envelopeId as string,
      );
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
