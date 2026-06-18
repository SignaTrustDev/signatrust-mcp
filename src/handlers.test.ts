import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOOLS, handleTool } from "./handlers.js";
import type { SignaTrustClient } from "./vendor/signatrust-sdk/index.js";

// =============================================================================
// Mock Client
// =============================================================================

function createMockClient() {
  return {
    listEnvelopes: vi.fn(),
    getEnvelope: vi.fn(),
    createEnvelope: vi.fn(),
    listTemplates: vi.fn(),
    requestDocumentUpload: vi.fn(),
    putBytesToUploadUrl: vi.fn(),
    analyzeEnvelope: vi.fn(),
    voidEnvelope: vi.fn(),
    verifyBlockchain: vi.fn(),
  } as unknown as SignaTrustClient & {
    listEnvelopes: ReturnType<typeof vi.fn>;
    getEnvelope: ReturnType<typeof vi.fn>;
    createEnvelope: ReturnType<typeof vi.fn>;
    listTemplates: ReturnType<typeof vi.fn>;
    requestDocumentUpload: ReturnType<typeof vi.fn>;
    putBytesToUploadUrl: ReturnType<typeof vi.fn>;
    analyzeEnvelope: ReturnType<typeof vi.fn>;
    voidEnvelope: ReturnType<typeof vi.fn>;
    verifyBlockchain: ReturnType<typeof vi.fn>;
  };
}

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  client = createMockClient();
});

// =============================================================================
// Tool Listing
// =============================================================================

describe("TOOLS", () => {
  it("should define the full tool set", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "list_envelopes",
      "get_envelope",
      "create_envelope",
      "list_templates",
      "upload_document",
      "analyze_document",
      "void_envelope",
      "verify_blockchain",
    ]);
  });

  it("should have input schemas and descriptions for all tools", () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("should mark void_envelope as destructive (user should confirm before Claude runs it)", () => {
    const voidTool = TOOLS.find((t) => t.name === "void_envelope");
    expect(voidTool?.annotations.destructiveHint).toBe(true);
    expect(voidTool?.annotations.readOnlyHint).toBe(false);
  });

  it("should NOT expose create_from_template (subsumed by create_envelope + templateId)", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).not.toContain("create_from_template");
  });
});

// =============================================================================
// list_envelopes
// =============================================================================

describe("list_envelopes", () => {
  it("should call listEnvelopes with params and return formatted result", async () => {
    const envelopes = {
      data: [{ id: "env_1", name: "Test" }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    client.listEnvelopes.mockResolvedValue(envelopes);

    const result = await handleTool(client, "list_envelopes", {
      status: "SENT",
      page: 1,
      limit: 10,
    });

    expect(client.listEnvelopes).toHaveBeenCalledWith({
      status: "SENT",
      page: 1,
      limit: 10,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
  });

  it("should accept DRAFT status in the schema", () => {
    const tool = TOOLS.find((t) => t.name === "list_envelopes");
    const props = tool?.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.status?.enum).toContain("DRAFT");
  });
});

// =============================================================================
// get_envelope
// =============================================================================

describe("get_envelope", () => {
  it("should call getEnvelope with envelopeId", async () => {
    client.getEnvelope.mockResolvedValue({ id: "env_1", name: "NDA" });

    const result = await handleTool(client, "get_envelope", { envelopeId: "env_1" });

    expect(client.getEnvelope).toHaveBeenCalledWith("env_1");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("NDA");
  });
});

// =============================================================================
// create_envelope
// =============================================================================

describe("create_envelope", () => {
  it("should pass name (not subject) to the backend", async () => {
    client.createEnvelope.mockResolvedValue({ id: "env_new", name: "Contract" });

    await handleTool(client, "create_envelope", {
      name: "Contract",
      signers: [{ name: "Alice", email: "alice@example.com" }],
      documentIds: ["doc_1"],
      message: "Please sign",
    });

    expect(client.createEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Contract",
        documentIds: ["doc_1"],
      }),
    );
  });

  it("should forward securityLevel when provided", async () => {
    client.createEnvelope.mockResolvedValue({
      id: "env_new",
      securityLevel: "CERTIFIED",
    });

    await handleTool(client, "create_envelope", {
      name: "Deed",
      signers: [{ name: "Alice", email: "alice@example.com" }],
      documentIds: ["doc_1"],
      securityLevel: "CERTIFIED",
    });

    expect(client.createEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "CERTIFIED" }),
    );
  });

  it("should pass templateId through (backend handles template copy)", async () => {
    client.createEnvelope.mockResolvedValue({ id: "env_tpl" });

    await handleTool(client, "create_envelope", {
      name: "From Template",
      signers: [{ name: "Bob", email: "bob@example.com" }],
      templateId: "tpl_1",
    });

    expect(client.createEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "tpl_1",
        documentIds: undefined,
      }),
    );
  });

  it("should expose securityLevel enum in the tool schema", () => {
    const tool = TOOLS.find((t) => t.name === "create_envelope");
    const props = tool?.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.securityLevel?.enum).toEqual([
      "STANDARD",
      "VERIFIED",
      "CERTIFIED",
    ]);
  });

  it("should expose both documentIds and templateId in the schema", () => {
    const tool = TOOLS.find((t) => t.name === "create_envelope");
    const props = tool?.inputSchema.properties as Record<string, unknown>;
    expect(props.documentIds).toBeDefined();
    expect(props.templateId).toBeDefined();
  });
});

// =============================================================================
// list_templates
// =============================================================================

describe("list_templates", () => {
  it("should call listTemplates with params", async () => {
    client.listTemplates.mockResolvedValue([{ id: "tpl_1", name: "Lease" }]);

    const result = await handleTool(client, "list_templates", {
      includeSystem: false,
    });

    expect(client.listTemplates).toHaveBeenCalledWith({
      includeSystem: false,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
  });
});

// =============================================================================
// upload_document
// =============================================================================

describe("upload_document", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sig-mcp-"));
    filePath = join(tmpDir, "contract.pdf");
    await writeFile(filePath, Buffer.from("%PDF-1.4\nfake\n"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should read the file, request an upload URL, PUT the bytes, and return metadata", async () => {
    client.requestDocumentUpload.mockResolvedValue({
      id: "doc_123",
      name: "contract.pdf",
      contentType: "application/pdf",
      size: 14,
      hash: null,
      createdAt: "2026-04-21T00:00:00Z",
      uploadUrl: "https://s3.amazonaws.com/presigned/abc",
    });
    client.putBytesToUploadUrl.mockResolvedValue(undefined);

    const result = await handleTool(client, "upload_document", { filePath });

    expect(client.requestDocumentUpload).toHaveBeenCalledWith({
      name: "contract.pdf",
      contentType: "application/pdf",
      size: 14,
    });
    expect(client.putBytesToUploadUrl).toHaveBeenCalledWith(
      "https://s3.amazonaws.com/presigned/abc",
      expect.any(Uint8Array),
      "application/pdf",
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("doc_123");
    expect(parsed).not.toHaveProperty("uploadUrl"); // never surface the pre-signed URL
  });

  it("should respect an explicit name and contentType override", async () => {
    client.requestDocumentUpload.mockResolvedValue({
      id: "doc_1",
      name: "custom.pdf",
      contentType: "application/pdf",
      size: 14,
      hash: null,
      createdAt: "2026-04-21T00:00:00Z",
      uploadUrl: "https://example.test/u",
    });
    client.putBytesToUploadUrl.mockResolvedValue(undefined);

    await handleTool(client, "upload_document", {
      filePath,
      name: "custom.pdf",
      contentType: "application/pdf",
    });

    expect(client.requestDocumentUpload).toHaveBeenCalledWith({
      name: "custom.pdf",
      contentType: "application/pdf",
      size: 14,
    });
  });

  it("should infer contentType from a .docx extension", async () => {
    const docxPath = join(tmpDir, "agreement.docx");
    await writeFile(docxPath, Buffer.from("PK\x03\x04fake-docx"));

    client.requestDocumentUpload.mockResolvedValue({
      id: "doc_docx",
      name: "agreement.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 11,
      hash: null,
      createdAt: "2026-04-21T00:00:00Z",
      uploadUrl: "https://example.test/u",
    });
    client.putBytesToUploadUrl.mockResolvedValue(undefined);

    await handleTool(client, "upload_document", { filePath: docxPath });

    expect(client.requestDocumentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
  });
});

// =============================================================================
// analyze_document
// =============================================================================

describe("analyze_document", () => {
  it("should call analyzeEnvelope with envelopeId", async () => {
    client.analyzeEnvelope.mockResolvedValue({
      envelopeId: "env_1",
      analysis: { sentiment: "SAFE", flaggedClauses: [] },
      analyzedAt: "2026-04-21T12:00:00Z",
    });

    const result = await handleTool(client, "analyze_document", {
      envelopeId: "env_1",
    });

    expect(client.analyzeEnvelope).toHaveBeenCalledWith("env_1");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.analysis.sentiment).toBe("SAFE");
  });
});

// =============================================================================
// void_envelope
// =============================================================================

describe("void_envelope", () => {
  it("should call voidEnvelope with id and reason, returning the updated envelope", async () => {
    client.voidEnvelope.mockResolvedValue({
      id: "env_1",
      name: "Q1 agreement",
      status: "VOIDED",
      voidedAt: "2026-04-22T04:00:00Z",
      voidReason: "contract terms changed",
    });

    const result = await handleTool(client, "void_envelope", {
      envelopeId: "env_1",
      reason: "contract terms changed",
    });

    expect(client.voidEnvelope).toHaveBeenCalledWith("env_1", "contract terms changed");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("VOIDED");
    expect(parsed.voidReason).toBe("contract terms changed");
  });

  it("should call voidEnvelope with undefined reason when omitted", async () => {
    client.voidEnvelope.mockResolvedValue({ id: "env_1", status: "VOIDED" });

    await handleTool(client, "void_envelope", { envelopeId: "env_1" });

    expect(client.voidEnvelope).toHaveBeenCalledWith("env_1", undefined);
  });
});

// =============================================================================
// verify_blockchain
// =============================================================================

describe("verify_blockchain", () => {
  it("should call verifyBlockchain with envelopeId and pass through the response", async () => {
    client.verifyBlockchain.mockResolvedValue({
      envelopeId: "env_1",
      txId: "5xyz",
      network: "mainnet-beta",
      explorerUrl: "https://explorer.solana.com/tx/5xyz",
      compositeHash: "abc123",
      fileHash: "def456",
      hashVersion: 1,
      verified: true,
      timestamp: 1700000000,
    });

    const result = await handleTool(client, "verify_blockchain", {
      envelopeId: "env_1",
    });

    expect(client.verifyBlockchain).toHaveBeenCalledWith("env_1");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.verified).toBe(true);
    expect(parsed.compositeHash).toBe("abc123");
  });
});

// =============================================================================
// Unknown tool
// =============================================================================

describe("unknown tool", () => {
  it("should return an error for unknown tool name", async () => {
    const result = await handleTool(client, "does_not_exist", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });
});
