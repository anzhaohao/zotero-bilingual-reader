import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("../../src/zotero/globals", () => ({
  hostFetch: mocks.fetch,
  newAbortController: () => new AbortController(),
  newTextDecoder: () => new TextDecoder(),
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
}));

import { probeMineruApi } from "../../src/zotero/mineru-cloud";

describe("MinerU connection probe", () => {
  beforeEach(() => mocks.fetch.mockReset());

  it("checks official API authentication without creating a parse task", async () => {
    mocks.fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(probeMineruApi({
      mode: "official-api",
      endpoint: "https://mineru.net/api/v4/",
      token: "secret",
    })).resolves.toContain("HTTP 404");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://mineru.net/api/v4/extract/task/invalid-zbr-connection-test",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(mocks.fetch.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("reports an invalid official API token", async () => {
    mocks.fetch.mockResolvedValue({ status: 401, ok: false });
    await expect(probeMineruApi({
      mode: "official-api",
      endpoint: "https://mineru.net/api/v4",
      token: "bad-token",
    })).rejects.toThrow("Token 无效");
  });

  it("uses the local health endpoint without uploading a PDF", async () => {
    mocks.fetch.mockResolvedValue({ status: 200, ok: true });
    await expect(probeMineruApi({
      mode: "self-hosted",
      endpoint: "http://127.0.0.1:8000",
      autoStart: false,
    })).resolves.toContain("健康检查通过");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/health",
      expect.anything(),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
