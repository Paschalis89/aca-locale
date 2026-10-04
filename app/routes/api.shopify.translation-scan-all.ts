import type {
  ActionFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

import {
  SHOPIFY_TRANSLATABLE_RESOURCE_TYPES,
} from "../lib/shopify-translatable-resource-types";

import {
  fetchAllTranslationResources,
} from "../lib/shopify-translation-scanner.server";

type ResourceSummary = {
  resourceType: string;
  targetLocale: string;

  resources: number;
  fields: number;
  actionableFields: number;
  emptySource: number;
  missing: number;
  translated: number;
  outdated: number;
  coverage: number;
};

function getErrorMessage(
  error: unknown,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

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

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  const byResourceType:
    Record<
      string,
      ResourceSummary
    > = {};

  const errors: Array<{
    resourceType: string;
    message: string;
  }> = [];

  for (
    const resourceType
    of SHOPIFY_TRANSLATABLE_RESOURCE_TYPES
  ) {
    try {
      /*
       * Read every Shopify page
       * for this resource type.
       */
      const resources =
        await fetchAllTranslationResources(
          admin,
          resourceType,
          targetLocale,
        );

      /*
       * Persist the complete scan
       * in NestJS / PostgreSQL.
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

                completeScan:
                  true,

                resources:
                  resources.map(
                    (
                      resource:
                        any,
                    ) => ({
                      resourceId:
                        resource
                          .resourceId,

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
        throw new Error(
          `Backend ${backendResponse.status}: ${responseText}`,
        );
      }

      const summary =
        JSON.parse(
          responseText,
        ) as ResourceSummary;

      byResourceType[
        resourceType
      ] = summary;
    } catch (error) {
      console.error(
        `[ACA Locale] Unable to scan ${resourceType}:`,
        error,
      );

      /*
       * One unsupported/restricted
       * resource type must not abort
       * the entire store scan.
       */
      errors.push({
        resourceType,

        message:
          getErrorMessage(
            error,
          ),
      });
    }
  }

  const summaries =
    Object.values(
      byResourceType,
    );

  const totals =
    summaries.reduce(
      (
        total,
        item,
      ) => {
        total.resources +=
          item.resources;

        total.fields +=
          item.fields;

        total.actionableFields +=
          item.actionableFields;

        total.emptySource +=
          item.emptySource;

        total.missing +=
          item.missing;

        total.translated +=
          item.translated;

        total.outdated +=
          item.outdated;

        return total;
      },
      {
        resources: 0,
        fields: 0,
        actionableFields: 0,
        emptySource: 0,
        missing: 0,
        translated: 0,
        outdated: 0,
      },
    );

  const coverage =
    totals.actionableFields ===
    0
      ? 100
      : Math.round(
          (
            totals.translated /
            totals.actionableFields
          ) * 100,
        );

  const resourceTypesWithContent =
    summaries.filter(
      (item) =>
        item.resources >
        0,
    ).length;

  return Response.json({
    shop:
      session.shop,

    targetLocale,

    summary: {
      resourceTypesAttempted:
        SHOPIFY_TRANSLATABLE_RESOURCE_TYPES.length,

      resourceTypesSynced:
        summaries.length,

      resourceTypesWithContent,

      ...totals,

      coverage,

      errors:
        errors.length,
    },

    byResourceType,

    errors,
  });
}