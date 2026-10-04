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
        query AcaLocaleShopLocales {
          shopLocales {
            locale
            name
            primary
            published
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
      "[ACA Locale] shopLocales error:",
      result.errors,
    );

    return Response.json(
      {
        message:
          "Unable to retrieve Shopify locales.",
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

    locales:
      result.data?.shopLocales ??
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
        query AcaLocaleShopLocalesSync {
          shopLocales {
            locale
            name
            primary
            published
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
    return Response.json(
      {
        message:
          "Unable to retrieve Shopify locales.",
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

  const backendUrl =
    process.env.ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  const backendResponse =
    await fetch(
      `${backendUrl}/api/v1/languages/sync/shopify`,
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
            locales:
              result.data?.shopLocales ??
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