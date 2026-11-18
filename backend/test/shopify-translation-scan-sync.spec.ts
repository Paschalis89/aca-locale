import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/lib/shopify-translation-scanner.server", () => ({
  fetchTranslationPage: vi.fn(),
}));
import { fetchTranslationPage } from "../../app/lib/shopify-translation-scanner.server";
import { syncTranslationResourceType } from "../../app/lib/shopify-translation-scan-sync.server";

const page = vi.mocked(fetchTranslationPage);
const fetchMock = vi.fn();

const options = {
  admin: {}, resourceType: "PRODUCT", targetLocale: "en",
  backendUrl: "http://localhost:3001", authorization: "Bearer test",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => ({ ok: true, text: async () => JSON.stringify({ coverage: 100 }) }));
});

describe("streaming scanner sync", () => {
  it("persists each page before finalization with the complete ID list", async () => {
    page.mockResolvedValueOnce({
      resources: [{resourceId: "gid://shopify/Product/1", translatableContent: [], translations: []}],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    }).mockResolvedValueOnce({
      resources: [{resourceId: "gid://shopify/Product/2", translatableContent: [], translations: []}],
      pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
    });

    await syncTranslationResourceType(options);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[0].completeScan).toBe(false);
    expect(bodies[1].completeScan).toBe(false);
    expect(bodies[2]).toMatchObject({
      completeScan: true, resources: [],
      seenResourceIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
    });
  });

  it("does not tombstone resources if an intermediate page fails", async () => {
    page.mockResolvedValueOnce({
      resources: [{ resourceId: "gid://shopify/Product/1", translatableContent: [], translations: [] }],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    }).mockRejectedValueOnce(new Error("Shopify page failure"));
    await expect(syncTranslationResourceType(options)).rejects.toThrow("Shopify page failure");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).completeScan).toBe(false);
  });

  it("finalizes an empty Shopify catalog", async () => {
    page.mockResolvedValueOnce({ resources: [], pageInfo: { hasNextPage: false, endCursor: null } });
    await syncTranslationResourceType(options);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      completeScan: true, resources: [], seenResourceIds: [],
    });
  });

  it("refuses a repeated Shopify cursor without finalizing", async () => {
    page.mockResolvedValue({ resources: [], pageInfo: { hasNextPage: true, endCursor: "same" } });
    await expect(syncTranslationResourceType(options)).rejects.toThrow("repeated cursor");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
