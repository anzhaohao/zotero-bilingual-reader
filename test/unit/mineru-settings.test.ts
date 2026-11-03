import { describe, expect, it } from "vitest";
import { resolveSharedMinerUSettings } from "../../src/zotero/mineru-settings";

describe("shared MinerU settings", () => {
  it("uses Research Database values instead of Bilingual Reader legacy values", () => {
    const settings = resolveSharedMinerUSettings(
      {
        mineruMode: "self-hosted",
        mineruSelfHostedEndpoint: "http://127.0.0.1:9000/",
        mineruSharedStoreDirectory: "D:\\shared-mineru",
        mineruOfficialToken: "research-token",
        mineruModelVersion: "pipeline",
        mineruLanguage: "ch",
      },
      {
        mineruMode: "official-api",
        mineruSelfHostedEndpoint: "http://127.0.0.1:8000",
        mineruSharedStoreDirectory: "D:\\old-store",
        mineruOfficialToken: "legacy-token",
      },
    );
    expect(settings.mode).toBe("self-hosted");
    expect(settings.selfHostedEndpoint).toBe("http://127.0.0.1:9000");
    expect(settings.sharedStoreDirectory).toBe("D:\\shared-mineru");
    expect(settings.officialToken).toBe("research-token");
    expect(settings.modelVersion).toBe("pipeline");
  });

  it("keeps read-only compatibility with an old Bilingual Reader configuration", () => {
    const settings = resolveSharedMinerUSettings({}, {
      mineruMode: "official-api",
      mineruOfficialEndpoint: "https://mineru.net/api/v4/",
      mineruOfficialToken: "legacy-token",
    });
    expect(settings.mode).toBe("official-api");
    expect(settings.officialEndpoint).toBe("https://mineru.net/api/v4");
    expect(settings.officialToken).toBe("legacy-token");
  });

  it("defaults to the local Docker service without inventing an official endpoint", () => {
    const settings = resolveSharedMinerUSettings({});
    expect(settings.mode).toBe("self-hosted");
    expect(settings.selfHostedEndpoint).toBe("http://127.0.0.1:8000");
    expect(settings.officialEndpoint).toBe("");
    expect(settings.enableFormula).toBe(true);
    expect(settings.enableTable).toBe(true);
  });
});
