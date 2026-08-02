import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { confirmDestructiveOp } from "./destructive-confirm.js";
import { handleTool } from "./helpers.js";
import {
  applyVerbosity,
  applyVerbosityToItems,
  type Verbosity,
} from "./response-fields.js";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_VERBOSITY,
  paginationShape,
  verbosityField,
} from "./list-params.js";

const idShape = { id: z.number().int().describe("Resource id") };
const getShape = { ...idShape, verbosity: verbosityField };
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
  /** Hand-written human-readable singular, e.g. "Epic" — used to build
   * each tool's `title` (never mechanically derived from `resource`,
   * decided explicitly in phase 9). */
  resourceTitle: string;
  /** Hand-written plural, e.g. "User Stories" — defaults to
   * `${resourceTitle}s` when omitted, only needed for irregular plurals. */
  resourceTitlePlural?: string;
  /** e.g. "/api/v1/projects" */
  basePath: string;
  listInput: ZodRawShape;
  createInput: ZodRawShape;
  updateInput: ZodRawShape;
  /** See `ConfirmDestructiveOpOptions.requireElicitation`. Default false. */
  requireElicitation?: boolean;
  /**
   * Optional pre-processing hook run on `create`/`update` args (the full
   * tool input, including `id` on update) before they're sent to Taiga —
   * e.g. resolving name-based assignee/watcher identifiers into numeric
   * ids via `member-resolver.ts`. Only 4 of the 8 resources this helper
   * serves need this; left optional so the rest pay nothing, keeping
   * this generator itself free of resource-specific branching.
   */
  transformWriteArgs?: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  /** Appended to `_list`'s description — e.g. pointing at a matching
   * `*_filters_data` tool for cheap filter-id discovery. Only set for
   * the 3 resources that actually have one (user_story/task/issue). */
  listDescriptionSuffix?: string;
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
    resourceTitle,
    resourceTitlePlural = `${resourceTitle}s`,
    basePath,
    listInput,
    createInput,
    updateInput,
    requireElicitation,
    transformWriteArgs,
    listDescriptionSuffix,
  } = options;

  server.registerTool(
    `${resource}_list`,
    {
      title: `List ${resourceTitlePlural}`,
      description:
        `List ${resource}s, optionally filtered by the given query ` +
        `parameters. Response is { items, pagination } — pagination has ` +
        `{ count, current_page, has_next } read from Taiga. Default ` +
        `page_size is ${String(DEFAULT_PAGE_SIZE)}.` +
        (listDescriptionSuffix ? ` ${listDescriptionSuffix}` : ""),
      inputSchema: {
        ...listInput,
        ...paginationShape,
        verbosity: verbosityField,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool(`${resource}_list`, args, async () => {
        const { verbosity, ...query } = args as Record<string, unknown> & {
          verbosity?: Verbosity;
        };
        const result = await client.listPaginated<Record<string, unknown>[]>(
          basePath,
          query as Record<string, string | number | boolean | undefined>,
        );
        return {
          items: applyVerbosityToItems(
            result.items,
            verbosity ?? DEFAULT_VERBOSITY,
          ),
          pagination: result.pagination,
        };
      }),
  );

  server.registerTool(
    `${resource}_get`,
    {
      title: `Get ${resourceTitle}`,
      description: `Get a single ${resource} by id.`,
      inputSchema: getShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool(`${resource}_get`, args, async () => {
        const item = await client.get<Record<string, unknown>>(
          `${basePath}/${String(args.id)}`,
        );
        return applyVerbosity(item, args.verbosity ?? DEFAULT_VERBOSITY);
      }),
  );

  server.registerTool(
    `${resource}_create`,
    {
      title: `Create ${resourceTitle}`,
      description: `Create a new ${resource}.`,
      inputSchema: createInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      handleTool(`${resource}_create`, args, async () => {
        const body = transformWriteArgs ? await transformWriteArgs(args) : args;
        return client.create(basePath, body);
      }),
  );

  server.registerTool(
    `${resource}_update`,
    {
      title: `Update ${resourceTitle}`,
      description:
        `Update an existing ${resource} (partial patch — only include ` +
        `the fields you want to change). Taiga's optimistic-concurrency ` +
        `\`version\` field is handled automatically; do not pass it.`,
      inputSchema: { ...idShape, ...updateInput },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      handleTool(`${resource}_update`, args, async () => {
        const transformed = transformWriteArgs
          ? await transformWriteArgs(args)
          : args;
        const { id, ...patch } = transformed as { id: number } & Record<
          string,
          unknown
        >;
        return client.updateWithVersion(`${basePath}/${String(id)}`, patch);
      }),
  );

  server.registerTool(
    `${resource}_delete`,
    {
      title: `Delete ${resourceTitle}`,
      description:
        `Delete a ${resource} by id. This cannot be undone. Requires ` +
        `confirmation: elicitation-capable clients are prompted ` +
        `interactively; others must call again with confirm: true after ` +
        `reviewing the preview returned by the first call.`,
      inputSchema: deleteShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
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
