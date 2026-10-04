import type {
  LoaderFunctionArgs,
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
        query AcaLocaleShopIdentity {
          shop {
            id
            name
            myshopifyDomain
            currencyCode
            ianaTimezone

            primaryDomain {
              host
              url
            }

            plan {
              displayName
              partnerDevelopment
              shopifyPlus
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
      "[ACA Locale] Shopify GraphQL error:",
      result.errors,
    );

    return Response.json(
      {
        message:
          "Shopify Admin API returned an error.",
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
      result.data?.shop ??
      null,

    session: {
      shop:
        session.shop,

      isOnline:
        session.isOnline,

      scope:
        session.scope,
    },
  });
}