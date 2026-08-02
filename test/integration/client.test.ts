import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TaigaClient } from "../../src/client/taiga-client.js";
import { TaigaConflictError } from "../../src/errors/taiga-error.js";
import {
  getIntegrationConfig,
  shouldRunIntegrationTests,
  TestFixtureTracker,
} from "./setup.js";

const config = getIntegrationConfig();
const runIntegration = shouldRunIntegrationTests();

describe.runIf(runIntegration)("Integration: TaigaClient", () => {
  let client: TaigaClient;
  const tracker = new TestFixtureTracker();

  beforeAll(() => {
    if (!config) return;

    client = new TaigaClient({
      baseUrl: config.baseUrl,
      credentials: config.token
        ? { kind: "token", token: config.token }
        : {
            kind: "password",
            username: config.username!,
            password: config.password!,
          },
    });
  });

  afterAll(async () => {
    if (client) {
      await tracker.teardown(client);
    }
  });

  it("should authenticate and fetch user profile / users/me", async () => {
    const me = await client.get<{ id: number; username: string }>(
      "/api/v1/users/me",
    );
    expect(me).toBeDefined();
    expect(me.id).toBeGreaterThan(0);
    expect(typeof me.username).toBe("string");
  });

  it("should fetch project details by slug", async () => {
    const project = await client.get<{
      id: number;
      name: string;
      slug: string;
    }>(`/api/v1/projects/by_slug?slug=${config?.projectSlug}`);
    expect(project).toBeDefined();
    expect(project.id).toBeGreaterThan(0);
    expect(project.slug).toBe(config?.projectSlug);
  });

  it("should perform OCC versioned update safely", async () => {
    // Fetch project to get its ID
    const project = await client.get<{ id: number }>(
      `/api/v1/projects/by_slug?slug=${config?.projectSlug}`,
    );

    // Create a user story fixture
    const createdStory = await client.create<{
      id: number;
      version: number;
      subject: string;
    }>("/api/v1/userstories", {
      project: project.id,
      subject: `Integration OCC Test Story ${Date.now()}`,
    });

    tracker.track("userstories", createdStory.id);

    expect(createdStory.id).toBeGreaterThan(0);
    expect(typeof createdStory.version).toBe("number");

    // Perform OCC update
    const updatedStory = await client.updateWithVersion<{
      id: number;
      version: number;
      subject: string;
    }>(`/api/v1/userstories/${createdStory.id}`, {
      subject: `Integration OCC Updated Story ${Date.now()}`,
    });

    expect(updatedStory.id).toBe(createdStory.id);
    expect(updatedStory.version).toBeGreaterThan(createdStory.version);
  });

  it("should get a real 409 from Taiga on a stale-version PATCH, matching TaigaConflictError", async () => {
    // updateWithVersion's own GET-then-PATCH always uses a fresh
    // version, so it can't be made to hit its own 409-retry path
    // without winning a genuine timing race against a second live
    // client — not practical to force deterministically in CI. What
    // *is* practical and valuable to confirm against the real API
    // (per ADR-005's "not just the phase-1 mocked shape of a 409"
    // concern): that Taiga actually returns 409 with the shape our
    // error mapping (client/http.ts's mapError) expects when a PATCH
    // carries a stale version. The retry-on-409 orchestration itself
    // is covered deterministically by the mocked test in
    // test/unit/client/occ.test.ts.
    const project = await client.get<{ id: number }>(
      `/api/v1/projects/by_slug?slug=${config?.projectSlug}`,
    );

    const story = await client.create<{ id: number; version: number }>(
      "/api/v1/userstories",
      {
        project: project.id,
        subject: `Integration 409 Test Story ${Date.now()}`,
      },
    );
    tracker.track("userstories", story.id);
    const staleVersion = story.version;

    // Bump the version once via a legitimate PATCH.
    await client.request({
      method: "PATCH",
      path: `/api/v1/userstories/${story.id}`,
      body: { version: staleVersion, subject: "Bump 1" },
    });

    // Re-using the now-stale version must 409.
    await expect(
      client.request({
        method: "PATCH",
        path: `/api/v1/userstories/${story.id}`,
        body: { version: staleVersion, subject: "Bump 2 (stale)" },
      }),
    ).rejects.toBeInstanceOf(TaigaConflictError);
  });
});
