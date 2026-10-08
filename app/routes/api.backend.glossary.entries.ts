import type {
  ActionFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

export async function action({
  request,
}: ActionFunctionArgs) {
  await authenticate.admin(
    request,
  );

  if (
    request.method !==
    "POST"
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

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  const response =
    await fetch(
      `${backendUrl}/api/v1/glossaries/default/entries`,
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
          await request.text(),
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
