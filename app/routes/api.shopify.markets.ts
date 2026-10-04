import type {
  LoaderFunctionArgs,
  ActionFunctionArgs
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const {
    admin,
    session,
  } = await authenticate.admin(
    request,
  );

  const response =
    await admin.graphql(
      `#graphql
        query AcaLocaleMarkets {
          markets(first: 50) {
            nodes {
              id
              name
              handle
              status
              type

              webPresences(first: 10) {
                nodes {
                  id
                  subfolderSuffix

                  defaultLocale {
                    locale
                    name
                  }

                  alternateLocales {
                    locale
                    name
                  }

                  rootUrls {
                    locale
                    url
                  }
                }
              }
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
      "[ACA Locale] Markets error:",
      result.errors,
    );

    return Response.json(
      {
        message:
          "Unable to retrieve Shopify markets.",
        errors:
          result.errors,
      },
      {
        status: 502,
      },
    );
  }

  return Response.json({
    shop:
      session.shop,

    markets:
      result.data?.markets?.nodes ??
      [],
  });
}

export async function action({
  request,
}: ActionFunctionArgs) {
  const {
    admin,
  } = await authenticate.admin(
    request,
  );

  const response =
    await admin.graphql(
      `#graphql
        query AcaLocaleMarketsSync {
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
    process.env.ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  const backendResponse =
    await fetch(
      `${backendUrl}/api/v1/markets/sync/shopify`,
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
            markets:
              result.data?.markets?.nodes ??
              [],
          }),
      },
    );

  const body =
    await backendResponse.text();

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