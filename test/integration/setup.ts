import { TaigaClient } from "../../src/client/taiga-client.js";

export interface IntegrationConfig {
  baseUrl: string;
  token?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  projectSlug: string;
}

export function getIntegrationConfig(): IntegrationConfig | null {
  const baseUrl =
    process.env["TAIGA_TEST_BASE_URL"] ||
    process.env["TAIGA_BASE_URL"] ||
    "https://api.taiga.io";
  const token = process.env["TAIGA_TEST_TOKEN"] || process.env["TAIGA_TOKEN"];
  const username =
    process.env["TAIGA_TEST_USERNAME"] || process.env["TAIGA_USERNAME"];
  const password =
    process.env["TAIGA_TEST_PASSWORD"] || process.env["TAIGA_PASSWORD"];
  const projectSlug =
    process.env["TAIGA_TEST_PROJECT_SLUG"] || "mcp-ci-test-project";

  const hasAuth = Boolean(token || (username && password));

  if (!hasAuth) {
    return null;
  }

  return {
    baseUrl,
    token: token || undefined,
    username: username || undefined,
    password: password || undefined,
    projectSlug,
  };
}

export function shouldRunIntegrationTests(): boolean {
  return getIntegrationConfig() !== null;
}

export interface CreatedFixture {
  endpoint: string;
  id: number;
}

export class TestFixtureTracker {
  private fixtures: CreatedFixture[] = [];

  track(endpoint: string, id: number): void {
    this.fixtures.push({ endpoint, id });
  }

  async teardown(client: TaigaClient): Promise<void> {
    // Delete in reverse creation order
    const toDelete = [...this.fixtures].reverse();
    this.fixtures = [];

    for (const fixture of toDelete) {
      try {
        await client.request({
          method: "DELETE",
          path: `/api/v1/${fixture.endpoint}/${fixture.id}`,
        });
      } catch {
        // Ignore teardown errors for items already deleted by tests
      }
    }
  }
}
