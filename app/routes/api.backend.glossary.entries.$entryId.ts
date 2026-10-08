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
  await authenticate.admin(
    request,
  );

  if (
    request.method !==
      "PATCH" &&
    request.method !==
      "DELETE"
  ) {
    return Response.json(
      {
        message:
          "Method not allowed.",
      },
      {
        status:
          405,
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
        status:
          401,
      },
    );
  }

  const entryId =
    params.entryId;

  if (!entryId) {
    return Response.json(
      {
        message:
          "Missing glossary entry id.",
      },
      {
        status:
          400,
      },
    );
  }

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  const response =
    await fetch(
      `${backendUrl}/api/v1/glossaries/default/entries/${encodeURIComponent(entryId)}`,
      {
        method:
          request.method,

        headers: {
          Authorization:
            authorization,

          ...(request.method ===
          "PATCH"
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),
        },

        ...(request.method ===
        "PATCH"
          ? {
              body:
                await request.text(),
            }
          : {}),
      },
    );

  return new Response(
    await response.text(),
    {
      status:
        response.status,

      headers: {
        "Content-Type":
          response.headers.get(
            "content-type",
          ) ??
          "application/json",
      },
    },
  );
}
