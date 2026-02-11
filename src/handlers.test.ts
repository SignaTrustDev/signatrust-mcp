import { describe, it, expect, vi, beforeEach } from "vitest";
import { TOOLS, handleTool } from "./handlers.js";
import type { SignaTrustClient } from "@signatrustdev/signatrust-sdk";

// =============================================================================
// Mock Client
// =============================================================================

function createMockClient() {
  return {
    listEnvelopes: vi.fn(),
    getEnvelope: vi.fn(),
    createEnvelope: vi.fn(),
    voidEnvelope: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createDocument: vi.fn(),
    verifyBlockchain: vi.fn(),
    getEnvelopeStats: vi.fn(),
  } as unknown as SignaTrustClient & {
    listEnvelopes: ReturnType<typeof vi.fn>;
    getEnvelope: ReturnType<typeof vi.fn>;
    createEnvelope: ReturnType<typeof vi.fn>;
    voidEnvelope: ReturnType<typeof vi.fn>;
    listTemplates: ReturnType<typeof vi.fn>;
    getTemplate: ReturnType<typeof vi.fn>;
    createDocument: ReturnType<typeof vi.fn>;
    verifyBlockchain: ReturnType<typeof vi.fn>;
    getEnvelopeStats: ReturnType<typeof vi.fn>;
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
  it("should define all 8 tools", () => {
    expect(TOOLS).toHaveLength(8);
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("list_envelopes");
    expect(names).toContain("get_envelope");
    expect(names).toContain("create_envelope");
    expect(names).toContain("void_envelope");
    expect(names).toContain("list_templates");
    expect(names).toContain("create_from_template");
    expect(names).toContain("verify_blockchain");
    expect(names).toContain("get_envelope_stats");
  });

  it("should have input schemas for all tools", () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("should have descriptions for all tools", () => {
    for (const tool of TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});

// =============================================================================
// list_envelopes
// =============================================================================

describe("list_envelopes", () => {
  it("should call listEnvelopes with params and return formatted result", async () => {
    const envelopes = {
      data: [{ id: "env_1", subject: "Test" }],
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

  it("should work with no params", async () => {
    client.listEnvelopes.mockResolvedValue({ data: [], pagination: {} });

    const result = await handleTool(client, "list_envelopes", {});

    expect(client.listEnvelopes).toHaveBeenCalledWith({
      status: undefined,
      page: undefined,
      limit: undefined,
    });
    expect(result.isError).toBeUndefined();
  });
});

// =============================================================================
// get_envelope
// =============================================================================

describe("get_envelope", () => {
  it("should call getEnvelope with id", async () => {
    client.getEnvelope.mockResolvedValue({ id: "env_1", subject: "NDA" });

    const result = await handleTool(client, "get_envelope", { id: "env_1" });

    expect(client.getEnvelope).toHaveBeenCalledWith("env_1");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.subject).toBe("NDA");
  });
});

// =============================================================================
// create_envelope
// =============================================================================

describe("create_envelope", () => {
  it("should call createEnvelope with full input", async () => {
    client.createEnvelope.mockResolvedValue({ id: "env_new" });

    const input = {
      subject: "Contract",
      signers: [{ name: "Alice", email: "alice@example.com" }],
      documentIds: ["doc_1"],
      message: "Please sign",
    };

    const result = await handleTool(client, "create_envelope", input);

    expect(client.createEnvelope).toHaveBeenCalledWith(input);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("env_new");
  });
});

// =============================================================================
// void_envelope
// =============================================================================

describe("void_envelope", () => {
  it("should call voidEnvelope with id and reason", async () => {
    client.voidEnvelope.mockResolvedValue({ id: "env_1", status: "VOIDED" });

    await handleTool(client, "void_envelope", {
      id: "env_1",
      voidReason: "Wrong document",
    });

    expect(client.voidEnvelope).toHaveBeenCalledWith(
      "env_1",
      "Wrong document",
    );
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
// create_from_template
// =============================================================================

describe("create_from_template", () => {
  it("should orchestrate 3-step template creation", async () => {
    client.getTemplate.mockResolvedValue({
      id: "tpl_1",
      name: "Lease Agreement",
      documentName: "lease.pdf",
      contentType: "application/pdf",
      documentUrl: "https://s3.amazonaws.com/templates/lease.pdf?token=abc",
    });
    client.createDocument.mockResolvedValue({
      id: "doc_new",
      name: "lease.pdf",
    });
    client.createEnvelope.mockResolvedValue({
      id: "env_new",
      subject: "Lease Agreement",
    });

    const result = await handleTool(client, "create_from_template", {
      templateId: "tpl_1",
      signers: [{ name: "Bob", email: "bob@example.com" }],
    });

    // Step 1: Get template
    expect(client.getTemplate).toHaveBeenCalledWith("tpl_1");

    // Step 2: Create document from template
    expect(client.createDocument).toHaveBeenCalledWith({
      fileName: "lease.pdf",
      fileType: "application/pdf",
      s3Key: "https://s3.amazonaws.com/templates/lease.pdf",
    });

    // Step 3: Create envelope
    expect(client.createEnvelope).toHaveBeenCalledWith({
      subject: "Lease Agreement",
      signers: [{ name: "Bob", email: "bob@example.com" }],
      documentIds: ["doc_new"],
      message: undefined,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.envelope.id).toBe("env_new");
    expect(parsed.templateUsed.id).toBe("tpl_1");
    expect(parsed.documentCreated.id).toBe("doc_new");
  });

  it("should use custom subject when provided", async () => {
    client.getTemplate.mockResolvedValue({
      id: "tpl_1",
      name: "Lease Agreement",
      documentName: "lease.pdf",
      contentType: "application/pdf",
    });
    client.createDocument.mockResolvedValue({ id: "doc_1" });
    client.createEnvelope.mockResolvedValue({ id: "env_1" });

    await handleTool(client, "create_from_template", {
      templateId: "tpl_1",
      subject: "Custom Subject",
      signers: [{ name: "Alice" }],
    });

    expect(client.createEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Custom Subject" }),
    );
  });

  it("should handle template without documentUrl", async () => {
    client.getTemplate.mockResolvedValue({
      id: "tpl_1",
      name: "Template",
      documentName: "doc.pdf",
      contentType: "application/pdf",
      documentUrl: undefined,
    });
    client.createDocument.mockResolvedValue({ id: "doc_1" });
    client.createEnvelope.mockResolvedValue({ id: "env_1" });

    await handleTool(client, "create_from_template", {
      templateId: "tpl_1",
      signers: [{ name: "Alice" }],
    });

    expect(client.createDocument).toHaveBeenCalledWith({
      fileName: "doc.pdf",
      fileType: "application/pdf",
      s3Key: undefined,
    });
  });
});

// =============================================================================
// verify_blockchain
// =============================================================================

describe("verify_blockchain", () => {
  it("should call verifyBlockchain with envelopeId", async () => {
    client.verifyBlockchain.mockResolvedValue({
      verified: true,
      envelopeId: "env_1",
      transactionId: "tx_abc",
      network: "mainnet-beta",
    });

    const result = await handleTool(client, "verify_blockchain", {
      envelopeId: "env_1",
    });

    expect(client.verifyBlockchain).toHaveBeenCalledWith("env_1");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.verified).toBe(true);
    expect(parsed.transactionId).toBe("tx_abc");
  });
});

// =============================================================================
// get_envelope_stats
// =============================================================================

describe("get_envelope_stats", () => {
  it("should call getEnvelopeStats with params", async () => {
    client.getEnvelopeStats.mockResolvedValue({
      waiting: 5,
      completed: 10,
      voided: 2,
    });

    const result = await handleTool(client, "get_envelope_stats", {
      ownerOnly: true,
    });

    expect(client.getEnvelopeStats).toHaveBeenCalledWith({
      ownerOnly: true,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.waiting).toBe(5);
  });
});

// =============================================================================
// Error Handling
// =============================================================================

describe("error handling", () => {
  it("should return unknown tool error for unrecognized tool name", async () => {
    const result = await handleTool(client, "nonexistent_tool", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
    expect(result.content[0].text).toContain("nonexistent_tool");
  });

  it("should propagate API errors to caller", async () => {
    client.getEnvelope.mockRejectedValue(new Error("Network error"));

    await expect(
      handleTool(client, "get_envelope", { id: "bad" }),
    ).rejects.toThrow("Network error");
  });
});
