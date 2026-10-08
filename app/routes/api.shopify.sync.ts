import type {
  ActionFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

import {
  syncMetaobjectWebhookSubscriptions,
} from "../services/metaobject-webhooks.server";

export async function action({
  request,
}: ActionFunctionArgs) {
  const {
    admin,
  } = await authenticate.admin(
    request,
  );

  try {
    const response =
      await admin.graphql(
        `#graphql
          query AcaLocaleConfigurationSync {
            shop {
              id
              name
              currencyCode
              ianaTimezone

              primaryDomain {
                host
                url
              }
            }

            shopLocales {
              locale
              name
              primary
              published
            }

            markets(first: 50) {
              nodes {
                id
                name
                handle
                status
                type
              }
            }
          }
        `,
      );

    const result =
      await response.json();

    if (
      "errors" in result &&
      result.errors
    ) {
      console.error(
        "[ACA Locale] Shopify configuration query failed:",
        result.errors,
      );

      return Response.json(
        {
          message:
            "Unable to read Shopify configuration.",
          errors:
            result.errors,
        },
        {
          status: 502,
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

    const metaobjectWebhooks =
      await syncMetaobjectWebhookSubscriptions(
        admin,
      );

    console.info(
      "[ACA Locale] Metaobject webhook subscriptions synchronized:",
      metaobjectWebhooks,
    );

    const backendUrl =
      process.env.ACA_LOCALE_BACKEND_URL ??
      "http://127.0.0.1:3001";

    const backendResponse =
      await fetch(
        `${backendUrl}/api/v1/shopify/configuration/sync`,
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
              shop:
                result.data?.shop,

              locales:
                result.data?.shopLocales ??
                [],

              markets:
                result.data?.markets
                  ?.nodes ??
                [],
            }),
        },
      );

    const body =
      await backendResponse.text();

    if (!backendResponse.ok) {
      return new Response(
        body,
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

    try {
      const data = body
        ? JSON.parse(body)
        : {};

      return Response.json({
        ...(
          typeof data === "object" &&
          data !== null
            ? data
            : {
                result: data,
              }
        ),
        metaobjectWebhooks,
      });
    } catch {
      return Response.json({
        result: body,
        metaobjectWebhooks,
      });
    }
  } catch (error) {
    console.error(
      "[ACA Locale] Shopify configuration sync failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Shopify configuration sync failed.",
      },
      {
        status: 502,
      },
    );
  }
}