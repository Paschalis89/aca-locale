import type {
  ActionFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  const {
    admin,
  } =
    await authenticate.admin(
      request,
    );

  const {
    jobId,
    itemId,
  } =
    params;

  if (
    !jobId ||
    !itemId
  ) {
    return Response.json(
      {
        message:
          "Missing translation job or item ID.",
      },
      {
        status:
          400,
      },
    );
  }

  const authorization =
    request.headers.get(
      "authorization",
    );

  if (
    !authorization
  ) {
    return Response.json(
      {
        message:
          "Missing Shopify ID token.",
      },
      {
        status:
          401,
      },
    );
  }

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  try {
    /*
     * 1. Read the approved item from NestJS.
     */
    const jobResponse =
      await fetch(
        `${backendUrl}/api/v1/translations/jobs/${encodeURIComponent(
          jobId,
        )}`,
        {
          headers: {
            Authorization:
              authorization,
          },
        },
      );

    const jobText =
      await jobResponse.text();

    if (
      !jobResponse.ok
    ) {
      return new Response(
        jobText,
        {
          status:
            jobResponse.status,

          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    const job =
      JSON.parse(
        jobText,
      );

    const item =
      job.items?.find(
        (
          candidate:
            any,
        ) =>
          candidate.id ===
          itemId,
      );

    if (
      !item
    ) {
      return Response.json(
        {
          message:
            "Translation job item not found.",
        },
        {
          status:
            404,
        },
      );
    }

    /*
     * Idempotency.
     */
    if (
      item.status ===
        "PUBLISHED"
    ) {
      return Response.json({
        published:
          true,

        alreadyPublished:
          true,

        item,
      });
    }

    if (
      item.status !==
        "APPROVED"
    ) {
      return Response.json(
        {
          message:
            `Translation item cannot be published from status "${item.status}".`,
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !item.approvedValue
    ) {
      return Response.json(
        {
          message:
            "Translation item has no approved value.",
        },
        {
          status:
            400,
        },
      );
    }

    const resourceId =
      item.field?.resource
        ?.shopifyResourceId;

    const fieldKey =
      item.field?.key;

    if (
      !resourceId ||
      !fieldKey
    ) {
      return Response.json(
        {
          message:
            "Translation item is missing Shopify resource information.",
        },
        {
          status:
            400,
        },
      );
    }

    /*
     * 2. Read the CURRENT source digest
     * directly from Shopify.
     *
     * We never publish using a stale snapshot.
     */
    const resourceResponse =
      await admin.graphql(
        `#graphql
          query AcaLocalePublishResource(
            $resourceId: ID!
          ) {
            translatableResource(
              resourceId: $resourceId
            ) {
              resourceId

              translatableContent {
                key
                value
                locale
                digest
              }
            }
          }
        `,
        {
          variables: {
            resourceId,
          },
        },
      );

    const resourceJson =
      await resourceResponse.json();

    if (
      resourceJson.errors
    ) {
      console.error(
        "[ACA Locale] Shopify translatableResource failed:",
        resourceJson.errors,
      );

      return Response.json(
        {
          message:
            "Unable to read current Shopify translation source.",

          errors:
            resourceJson.errors,
        },
        {
          status:
            502,
        },
      );
    }

    const content =
      resourceJson.data
        ?.translatableResource
        ?.translatableContent
        ?.find(
          (
            candidate:
              any,
          ) =>
            candidate.key ===
            fieldKey,
        );

    if (
      !content
    ) {
      return Response.json(
        {
          message:
            `Shopify translatable content "${fieldKey}" was not found.`,
        },
        {
          status:
            409,
        },
      );
    }

    if (
      !content.digest
    ) {
      return Response.json(
        {
          message:
            "Shopify did not return a translatable content digest.",
        },
        {
          status:
            409,
        },
      );
    }

    /*
     * Critical optimistic concurrency check.
     *
     * If the merchant changed the source
     * after ACA Locale generated the translation,
     * publishing must stop.
     */
    if (
      content.digest !==
      item.sourceDigest
    ) {
      return Response.json(
        {
          message:
            "The Shopify source content changed after this translation was generated. Rescan and regenerate before publishing.",

          code:
            "SOURCE_DIGEST_MISMATCH",

          storedDigest:
            item.sourceDigest,

          currentDigest:
            content.digest,

          sourceValue:
            item.sourceValue,

          currentSourceValue:
            content.value,
        },
        {
          status:
            409,
        },
      );
    }

    /*
     * 3. Publish to Shopify.
     */
    const registerResponse =
      await admin.graphql(
        `#graphql
          mutation AcaLocaleRegisterTranslation(
            $resourceId: ID!
            $translations: [TranslationInput!]!
          ) {
            translationsRegister(
              resourceId: $resourceId
              translations: $translations
            ) {
              translations {
                key
                locale
                value
                outdated
                updatedAt
              }

              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            resourceId,

            translations: [
              {
                locale:
                  job.targetLocale,

                key:
                  fieldKey,

                value:
                  item.approvedValue,

                translatableContentDigest:
                  content.digest,
              },
            ],
          },
        },
      );

    const registerJson =
      await registerResponse.json();

    if (
      registerJson.errors
    ) {
      console.error(
        "[ACA Locale] translationsRegister GraphQL failed:",
        registerJson.errors,
      );

      return Response.json(
        {
          message:
            "Shopify translation publication failed.",

          errors:
            registerJson.errors,
        },
        {
          status:
            502,
        },
      );
    }

    const publication =
      registerJson.data
        ?.translationsRegister;

    const userErrors =
      publication
        ?.userErrors ??
      [];

    if (
      userErrors.length >
      0
    ) {
      return Response.json(
        {
          message:
            "Shopify rejected the translation.",

          userErrors,
        },
        {
          status:
            422,
        },
      );
    }

    /*
     * 4. Only AFTER Shopify succeeds,
     * confirm publication in NestJS.
     */
    const confirmationResponse =
      await fetch(
        `${backendUrl}/api/v1/translations/jobs/${encodeURIComponent(
          jobId,
        )}/items/${encodeURIComponent(
          itemId,
        )}/published`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              authorization,
          },
        },
      );

    const confirmationText =
      await confirmationResponse.text();

    if (
      !confirmationResponse.ok
    ) {
      console.error(
        "[ACA Locale] Shopify published successfully but local confirmation failed:",
        confirmationText,
      );

      return Response.json(
        {
          message:
            "Translation was published to Shopify, but ACA Locale could not confirm the local state.",

          code:
            "LOCAL_CONFIRMATION_FAILED",

          shopify:
            publication,

          backend:
            confirmationText,
        },
        {
          status:
            502,
        },
      );
    }

    const localItem =
      JSON.parse(
        confirmationText,
      );

    return Response.json({
      published:
        true,

      alreadyPublished:
        false,

      shopify:
        publication,

      item:
        localItem,
    });
  } catch (error) {
    console.error(
      "[ACA Locale] Translation publication failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Translation publication failed.",
      },
      {
        status:
          502,
      },
    );
  }
}