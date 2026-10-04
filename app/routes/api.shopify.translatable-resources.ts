import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

import {
  isShopifyTranslatableResourceType,
} from "../lib/shopify-translatable-resource-types";

import {
  fetchAllTranslationResources,
  fetchTranslationPage,
} from "../lib/shopify-translation-scanner.server";

type ScannerStatus =
  | "EMPTY_SOURCE"
  | "MISSING"
  | "TRANSLATED"
  | "OUTDATED";

function buildScannerView(
  resources: any[],
) {
  let totalFields = 0;
  let actionableFields = 0;

  let emptySourceFields = 0;
  let missingFields = 0;
  let translatedFields = 0;
  let outdatedFields = 0;

  const scannedResources =
    resources.map(
      (resource: any) => {
        const translations =
          resource.translations ??
          [];

        const fields =
          (
            resource.translatableContent ??
            []
          ).map(
            (content: any) => {
              totalFields++;

              const sourceValue =
                typeof content.value ===
                "string"
                  ? content.value
                  : "";

              let status:
                ScannerStatus;

              let translation:
                any = null;

              if (
                !sourceValue.trim()
              ) {
                status =
                  "EMPTY_SOURCE";

                emptySourceFields++;
              } else {
                actionableFields++;

                /*
                 * Ignore market-specific
                 * translations for now.
                 */
                translation =
                  translations.find(
                    (
                      item: any,
                    ) =>
                      item.key ===
                        content.key &&
                      !item.market,
                  ) ??
                  null;

                if (!translation) {
                  status =
                    "MISSING";

                  missingFields++;
                } else if (
                  translation.outdated
                ) {
                  status =
                    "OUTDATED";

                  outdatedFields++;
                } else {
                  status =
                    "TRANSLATED";

                  translatedFields++;
                }
              }

              return {
                key:
                  content.key,

                type:
                  content.type,

                source: {
                  locale:
                    content.locale,

                  value:
                    content.value,

                  digest:
                    content.digest,
                },

                translation:
                  translation
                    ? {
                        locale:
                          translation.locale,

                        value:
                          translation.value,

                        outdated:
                          translation.outdated,

                        updatedAt:
                          translation.updatedAt,
                      }
                    : null,

                status,
              };
            },
          );

        return {
          resourceId:
            resource.resourceId,

          fields,
        };
      },
    );

  const coverage =
    actionableFields === 0
      ? 100
      : Math.round(
          (
            translatedFields /
            actionableFields
          ) * 100,
        );

  return {
    summary: {
      resources:
        scannedResources.length,

      fields:
        totalFields,

      actionableFields,

      emptySource:
        emptySourceFields,

      missing:
        missingFields,

      translated:
        translatedFields,

      outdated:
        outdatedFields,

      coverage,
    },

    resources:
      scannedResources,
  };
}

/*
 * GET
 *
 * Reads a single Shopify page.
 * Useful as live/debug preview.
 *
 * Nothing is persisted.
 *
 * Example:
 *
 * /api/shopify/translatable-resources
 *   ?resourceType=PRODUCT
 *   &locale=it
 */
export async function loader({
  request,
}: LoaderFunctionArgs) {
  const {
    admin,
    session,
  } = await authenticate.admin(
    request,
  );

  const url =
    new URL(request.url);

  const targetLocale =
    url.searchParams.get(
      "locale",
    );

  const resourceType =
    (
      url.searchParams.get(
        "resourceType",
      ) ??
      "PRODUCT"
    ).toUpperCase();

  const after =
    url.searchParams.get(
      "after",
    );

  if (!targetLocale) {
    return Response.json(
      {
        message:
          "Missing target locale.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isShopifyTranslatableResourceType(
      resourceType,
    )
  ) {
    return Response.json(
      {
        message:
          "Unsupported resource type.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const page =
      await fetchTranslationPage(
        admin,
        resourceType,
        targetLocale,
        after,
      );

    const scanner =
      buildScannerView(
        page.resources,
      );

    return Response.json({
      shop:
        session.shop,

      resourceType,

      targetLocale,

      summary:
        scanner.summary,

      resources:
        scanner.resources,

      pageInfo:
        page.pageInfo,
    });
  } catch (error) {
    console.error(
      "[ACA Locale] Translation scanner failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to scan Shopify translations.",
      },
      {
        status: 502,
      },
    );
  }
}

/*
 * POST
 *
 * Performs a COMPLETE scan for one
 * Shopify resource type.
 *
 * Pagination is handled automatically.
 *
 * The raw Shopify data is sent to NestJS,
 * where the persistent scanner projection
 * is updated.
 *
 * Example:
 *
 * POST
 * /api/shopify/translatable-resources
 *   ?resourceType=PRODUCT
 *   &locale=it
 */
export async function action({
  request,
}: ActionFunctionArgs) {
  const {
    admin,
    session,
  } = await authenticate.admin(
    request,
  );

  const url =
    new URL(request.url);

  const targetLocale =
    url.searchParams.get(
      "locale",
    );

  const resourceType =
    (
      url.searchParams.get(
        "resourceType",
      ) ??
      "PRODUCT"
    ).toUpperCase();

  if (!targetLocale) {
    return Response.json(
      {
        message:
          "Missing target locale.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isShopifyTranslatableResourceType(
      resourceType,
    )
  ) {
    return Response.json(
      {
        message:
          "Unsupported resource type.",
      },
      {
        status: 400,
      },
    );
  }

  const authorization =
    request.headers.get(
      "authorization",
    );

  if (!authorization) {
    return Response.json(
      {
        message:
          "Missing Shopify ID token.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    /*
     * Read ALL Shopify pages for
     * the selected resource type.
     */
    const resources =
      await fetchAllTranslationResources(
        admin,
        resourceType,
        targetLocale,
      );

    const backendUrl =
      process.env
        .ACA_LOCALE_BACKEND_URL ??
      "http://127.0.0.1:3001";

    /*
     * Send the raw Shopify state
     * to NestJS.
     *
     * NestJS remains responsible for:
     *
     * - persistence
     * - MISSING calculation
     * - TRANSLATED calculation
     * - OUTDATED calculation
     * - EMPTY_SOURCE calculation
     * - stale resource cleanup
     */
    const backendResponse =
      await fetch(
        `${backendUrl}/api/v1/translations/scanner/sync`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              authorization,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              resourceType,

              targetLocale,

              /*
               * fetchAllTranslationResources()
               * fetched every Shopify page.
               *
               * NestJS can therefore safely
               * remove resources that are no
               * longer present on Shopify.
               */
              completeScan:
                true,

              resources:
                resources.map(
                  (
                    resource:
                      any,
                  ) => ({
                    resourceId:
                      resource.resourceId,

                    content:
                      resource
                        .translatableContent ??
                      [],

                    translations:
                      resource
                        .translations ??
                      [],
                  }),
                ),
            }),
        },
      );

    const responseText =
      await backendResponse.text();

    if (
      !backendResponse.ok
    ) {
      console.error(
        "[ACA Locale] Translation scan persistence failed:",
        responseText,
      );

      return new Response(
        responseText,
        {
          status:
            backendResponse.status,

          headers: {
            "Content-Type":
              backendResponse.headers.get(
                "content-type",
              ) ??
              "application/json",
          },
        },
      );
    }

    let backendData:
      unknown;

    try {
      backendData =
        JSON.parse(
          responseText,
        );
    } catch {
      backendData =
        responseText;
    }

    return Response.json({
      shop:
        session.shop,

      persisted:
        true,

      ...(
        typeof backendData ===
          "object" &&
        backendData !== null
          ? backendData
          : {
              result:
                backendData,
            }
      ),
    });
  } catch (error) {
    console.error(
      "[ACA Locale] Translation scan synchronization failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to synchronize Shopify translation scan.",
      },
      {
        status: 502,
      },
    );
  }
}