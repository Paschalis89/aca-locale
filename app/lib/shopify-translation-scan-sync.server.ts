import { fetchTranslationPage } from "./shopify-translation-scanner.server";

type SyncArgs = {
  admin: any;
  resourceType: string;
  targetLocale: string;
  backendUrl: string;
  authorization: string;
};

/**
 * Stream one Shopify page per authenticated backend request. Never buffer
 * all field content in the gateway and never tombstone until every page
 * has been fetched AND persisted successfully.
 */
export async function syncTranslationResourceType({
  admin, resourceType, targetLocale, backendUrl, authorization,
}: SyncArgs) {
  const scanStartedAt = new Date().toISOString();
  const seenResourceIds: string[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;

  const postSync = async (body: Record<string, unknown>) => {
    const response = await fetch(
      `${backendUrl}/api/v1/translations/scanner/sync`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resourceType, targetLocale, ...body }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Backend scanner ${response.status}: ${text.slice(0, 2000)}`);
    }
    return JSON.parse(text);
  };

  while (true) {
    const page = await fetchTranslationPage(admin, resourceType, targetLocale, after);
    const resources = page.resources.map((resource: any) => ({
      resourceId: resource.resourceId,
      content: resource.translatableContent ?? [],
      translations: resource.translations ?? [],
    }));

    // Persist this page before attempting the next. A failed page cannot
    // trigger the deletion of entries from an incomplete catalog snapshot.
    if (resources.length > 0) {
      await postSync({ completeScan: false, resources });
      seenResourceIds.push(...resources.map((resource: {resourceId: string}) => resource.resourceId));
    }

    if (!page.pageInfo.hasNextPage) break;
    const next = page.pageInfo.endCursor;
    if (!next || seenCursors.has(next)) {
      throw new Error("Shopify pagination returned a missing or repeated cursor.");
    }
    seenCursors.add(next);
    after = next;
  }

  // Finalize only after every page has been committed. Empty collections
  // must also finalize, to tombstone resources deleted from Shopify.
  return postSync({ completeScan: true, resources: [], seenResourceIds, scanStartedAt });
}
