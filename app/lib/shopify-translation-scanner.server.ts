export async function fetchTranslationPage(
  admin: any,
  resourceType: string,
  targetLocale: string,
  after: string | null,
) {
  const response =
    await admin.graphql(
      `#graphql
        query AcaLocaleTranslationScanner(
          $resourceType: TranslatableResourceType!
          $targetLocale: String!
          $after: String
        ) {
          translatableResources(
            first: 50
            resourceType: $resourceType
            after: $after
          ) {
            nodes {
              resourceId

              translatableContent {
                key
                value
                locale
                digest
                type
              }

              translations(
                locale: $targetLocale
              ) {
                key
                locale
                value
                outdated
                updatedAt

                market {
                  id
                  name
                }
              }
            }

            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        variables: {
          resourceType,
          targetLocale,
          after,
        },
      },
    );

  const result =
    await response.json() as any;

  if (result.errors) {
    throw new Error(
      JSON.stringify(
        result.errors,
      ),
    );
  }

  return {
    resources:
      result.data
        ?.translatableResources
        ?.nodes ??
      [],

    pageInfo:
      result.data
        ?.translatableResources
        ?.pageInfo ?? {
        hasNextPage: false,
        endCursor: null,
      },
  };
}

export async function fetchAllTranslationResources(
  admin: any,
  resourceType: string,
  targetLocale: string,
) {
  const resources:
    any[] = [];

  let after:
    string | null = null;

  let hasNextPage =
    true;

  while (hasNextPage) {
    const page =
      await fetchTranslationPage(
        admin,
        resourceType,
        targetLocale,
        after,
      );

    resources.push(
      ...page.resources,
    );

    hasNextPage =
      page.pageInfo
        .hasNextPage;

    after =
      page.pageInfo
        .endCursor ??
      null;

    if (
      hasNextPage &&
      !after
    ) {
      throw new Error(
        'Shopify returned hasNextPage=true without an endCursor.',
      );
    }
  }

  return resources;
}