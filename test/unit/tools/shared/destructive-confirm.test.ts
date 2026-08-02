import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import type { TaigaClient } from "../../../../src/client/taiga-client.js";
import { confirmDestructiveOp } from "../../../../src/tools/shared/destructive-confirm.js";

function makeClient(entity: unknown) {
  const get = vi.fn().mockResolvedValue(entity);
  const logInfo = vi.fn();
  const client = {
    get,
    logger: { info: logInfo },
  } as unknown as TaigaClient;
  return { client, get, logInfo };
}

function makeElicitationServer(options: {
  elicitInput: (params: { message: string }) => unknown;
}) {
  const elicitInput = vi.fn(options.elicitInput);
  const server = {
    server: {
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    },
  } as unknown as McpServer;
  return { server, elicitInput };
}

function makeFallbackServer() {
  const elicitInput = vi.fn();
  const server = {
    server: {
      getClientCapabilities: () => undefined,
      elicitInput,
    },
  } as unknown as McpServer;
  return { server, elicitInput };
}

describe("confirmDestructiveOp", () => {
  it("fetches the entity and includes its title in the elicitation message", async () => {
    const { client, get } = makeClient({ id: 42, subject: "Fix login bug" });
    let seenMessage = "";
    const { server } = makeElicitationServer({
      elicitInput: (params: { message: string }) => {
        seenMessage = params.message;
        return { action: "accept", content: { confirm: true } };
      },
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/userstories",
      id: 42,
      resourceLabel: "user_story",
      args: {},
    });

    expect(get).toHaveBeenCalledWith("/api/v1/userstories/42");
    expect(seenMessage).toContain("Fix login bug");
    expect(result).toEqual({ proceed: true });
  });

  it("falls back through title -> slug -> name -> id when subject is absent", async () => {
    const { client } = makeClient({ id: 7, name: "attachment.png" });
    let seenMessage = "";
    const { server } = makeElicitationServer({
      elicitInput: (params: { message: string }) => {
        seenMessage = params.message;
        return { action: "decline" };
      },
    });

    await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/attachments",
      id: 7,
      resourceLabel: "attachment",
      args: {},
    });

    expect(seenMessage).toContain("attachment.png");
  });

  it("elicitation accept with confirm: true proceeds", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => ({ action: "accept", content: { confirm: true } }),
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/epics",
      id: 1,
      resourceLabel: "epic",
      args: {},
    });

    expect(result).toEqual({ proceed: true });
  });

  it("elicitation accept with confirm: false does not proceed", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => ({ action: "accept", content: { confirm: false } }),
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/epics",
      id: 1,
      resourceLabel: "epic",
      args: {},
    });

    expect(result.proceed).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("elicitation decline does not proceed and is not an error", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => ({ action: "decline" }),
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/epics",
      id: 1,
      resourceLabel: "epic",
      args: {},
    });

    expect(result).toEqual({
      proceed: false,
      message: "Not deleted — cancelled.",
    });
  });

  it("elicitation cancel does not proceed", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => ({ action: "cancel" }),
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/epics",
      id: 1,
      resourceLabel: "epic",
      args: {},
    });

    expect(result).toEqual({
      proceed: false,
      message: "Not deleted — cancelled.",
    });
  });

  it("elicitation timeout (McpError RequestTimeout) does not proceed and is not rethrown", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => {
        throw new McpError(ErrorCode.RequestTimeout, "timed out");
      },
    });

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/epics",
      id: 1,
      resourceLabel: "epic",
      args: {},
      timeoutMs: 50,
    });

    expect(result).toEqual({
      proceed: false,
      message: "Not deleted — confirmation timed out.",
    });
  });

  it("rethrows non-timeout McpErrors from elicitInput", async () => {
    const { client } = makeClient({ id: 1, subject: "x" });
    const { server } = makeElicitationServer({
      elicitInput: () => {
        throw new McpError(ErrorCode.InternalError, "boom");
      },
    });

    await expect(
      confirmDestructiveOp({
        server,
        client,
        basePath: "/api/v1/epics",
        id: 1,
        resourceLabel: "epic",
        args: {},
      }),
    ).rejects.toThrow("boom");
  });

  it("fallback (no elicitation capability): first call without confirm returns a preview, no mutation signal", async () => {
    const { client } = makeClient({ id: 5, subject: "Fix login bug" });
    const { server, elicitInput } = makeFallbackServer();

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/userstories",
      id: 5,
      resourceLabel: "user_story",
      args: {},
    });

    expect(result.proceed).toBe(false);
    expect(result.message).toContain("Fix login bug");
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("fallback: confirm: true proceeds", async () => {
    const { client } = makeClient({ id: 5, subject: "Fix login bug" });
    const { server } = makeFallbackServer();

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/userstories",
      id: 5,
      resourceLabel: "user_story",
      args: { confirm: true },
    });

    expect(result).toEqual({ proceed: true });
  });

  it("falls back to just the id when no title field is present", async () => {
    const { client } = makeClient({ id: 9 });
    const { server } = makeFallbackServer();

    const result = await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/userstories",
      id: 9,
      resourceLabel: "user_story",
      args: {},
    });

    expect(result.message).toContain("#9");
  });

  it("logs an audit entry on every outcome (confirmed, via client.logger)", async () => {
    const { client, logInfo } = makeClient({ id: 5, subject: "Fix login bug" });
    const { server } = makeFallbackServer();

    await confirmDestructiveOp({
      server,
      client,
      basePath: "/api/v1/userstories",
      id: 5,
      resourceLabel: "user_story",
      args: { confirm: true },
    });

    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "destructive_op_delete",
        resource: "user_story",
        id: 5,
        title: "Fix login bug",
        capability: "fallback",
        outcome: "confirmed",
      }),
      expect.any(String),
    );
  });

  describe("requireElicitation: true", () => {
    it("blocks confirm: true on a client without the elicitation capability", async () => {
      const { client } = makeClient({ id: 5, subject: "Fix login bug" });
      const { server, elicitInput } = makeFallbackServer();

      const result = await confirmDestructiveOp({
        server,
        client,
        basePath: "/api/v1/userstories",
        id: 5,
        resourceLabel: "user_story",
        args: { confirm: true },
        requireElicitation: true,
      });

      expect(result.proceed).toBe(false);
      expect(result.message).toContain("requires an elicitation-capable");
      expect(elicitInput).not.toHaveBeenCalled();
    });

    it("logs the blocked attempt", async () => {
      const { client, logInfo } = makeClient({
        id: 5,
        subject: "Fix login bug",
      });
      const { server } = makeFallbackServer();

      await confirmDestructiveOp({
        server,
        client,
        basePath: "/api/v1/userstories",
        id: 5,
        resourceLabel: "user_story",
        args: { confirm: true },
        requireElicitation: true,
      });

      expect(logInfo).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "blocked", capability: "fallback" }),
        expect.any(String),
      );
    });

    it("does not affect an elicitation-capable client — accept still proceeds", async () => {
      const { client } = makeClient({ id: 1, subject: "x" });
      const { server } = makeElicitationServer({
        elicitInput: () => ({ action: "accept", content: { confirm: true } }),
      });

      const result = await confirmDestructiveOp({
        server,
        client,
        basePath: "/api/v1/epics",
        id: 1,
        resourceLabel: "epic",
        args: {},
        requireElicitation: true,
      });

      expect(result).toEqual({ proceed: true });
    });
  });
});
