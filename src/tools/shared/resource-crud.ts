import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { confirmDestructiveOp } from "./destructive-confirm.js";
import { handleTool } from "./helpers.js";

const idShape = { id: z.number().int().describe("Resource id") };
const deleteShape = {
  ...idShape,
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set true to actually delete after reviewing the preview from a " +
        "first call without it. Ignored by elicitation-capable clients, " +
        "which are prompted interactively instead.",
    ),
};

export interface RegisterCrudToolsOptions {
  server: McpServer;
  client: TaigaClient;
  /** Singular, lowercase, e.g. "project" — used as the tool name prefix and in descriptions. */
  resource: string;
  /** e.g. "/api/v1/projects" */
  basePath: string;
  listInput: ZodRawShape;
  createInput: ZodRawShape;
  updateInput: ZodRawShape;
  /** See `ConfirmDestructiveOpOptions.requireElicitation`. Default false. */
  requireElicitation?: boolean;
}

/**
 * Registers the five standard CRUD tools (`<resource>_list/get/create/
 * update/delete`) shared by every core resource. `update` goes through
 * `TaigaClient.updateWithVersion`, so callers never see or supply
 * Taiga's OCC `version` field — see
 * ai-docs/01_architecture/taiga-mcp-adr-004-resilience-and-error-handling.md.
 *
 * Deliberately **not generic** over each resource's exact zod shape:
 * the MCP SDK's `registerTool` resolves its own input-schema generic
 * from a conditional type, which does not resolve cleanly when handed
 * an already-generic (unresolved) type parameter from a wrapper
 * function like this one — TypeScript defers the conditional instead
 * of evaluating it, and the callback's inferred type then fails to
 * match. Accepting a concrete `ZodRawShape` here sidesteps that; this
 * layer only needs to pass args through to `TaigaClient` anyway, so no
 * per-resource type precision is lost in practice.
 *
 * Resource-specific extra actions (voting, watching, sub-resources,
 * etc.) are registered separately by each resource's own module — this
 * helper only covers the common shape, on purpose, to avoid forcing an
 * abstraction onto behavior that isn't actually shared.
 */
export function registerCrudTools(options: RegisterCrudToolsOptions): void {
  const {
    server,
    client,
    resource,
    basePath,
    listInput,
    createInput,
    updateInput,
    requireElicitation,
  } = options;

  server.registerTool(
    `${resource}_list`,
    {
      description: `List ${resource}s, optionally filtered by the given query parameters.`,
      inputSchema: listInput,
    },
    async (args) =>
      handleTool(`${resource}_list`, args, () => client.list(basePath, args)),
  );

  server.registerTool(
    `${resource}_get`,
    {
      description: `Get a single ${resource} by id.`,
      inputSchema: idShape,
    },
    async (args) =>
      handleTool(`${resource}_get`, args, () =>
        client.get(`${basePath}/${String(args.id)}`),
      ),
  );

  server.registerTool(
    `${resource}_create`,
    {
      description: `Create a new ${resource}.`,
      inputSchema: createInput,
    },
    async (args) =>
      handleTool(`${resource}_create`, args, () =>
        client.create(basePath, args),
      ),
  );

  server.registerTool(
    `${resource}_update`,
    {
      description:
        `Update an existing ${resource} (partial patch — only include ` +
        `the fields you want to change). Taiga's optimistic-concurrency ` +
        `\`version\` field is handled automatically; do not pass it.`,
      inputSchema: { ...idShape, ...updateInput },
    },
    async (args) => {
      const { id, ...patch } = args as { id: number } & Record<string, unknown>;
      return handleTool(`${resource}_update`, args, () =>
        client.updateWithVersion(`${basePath}/${String(id)}`, patch),
      );
    },
  );

  server.registerTool(
    `${resource}_delete`,
    {
      description:
        `Delete a ${resource} by id. This cannot be undone. Requires ` +
        `confirmation: elicitation-capable clients are prompted ` +
        `interactively; others must call again with confirm: true after ` +
        `reviewing the preview returned by the first call.`,
      inputSchema: deleteShape,
    },
    async (args) => {
      const gate = await confirmDestructiveOp({
        server,
        client,
        basePath,
        id: args.id,
        resourceLabel: resource,
        args,
        requireElicitation,
      });
      if (!gate.proceed) {
        return {
          content: [
            { type: "text", text: gate.message ?? "Not deleted — cancelled." },
          ],
        };
      }
      return handleTool(`${resource}_delete`, args, () =>
        client.delete(`${basePath}/${String(args.id)}`),
      );
    },
  );
}
