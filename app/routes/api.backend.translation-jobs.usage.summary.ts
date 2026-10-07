import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  await authenticate.admin(
    request,
  );

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

  const url =
    new URL(
      request.url,
    );

  const days =
    url.searchParams.get(
      "days",
    ) ?? "30";

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  try {
    const backendResponse =
      await fetch(
        `${backendUrl}/api/v1/translations/jobs/usage/summary?days=${encodeURIComponent(
          days,
        )}`,
        {
          method:
            "GET",

          headers: {
            Authorization:
              authorization,
          },
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
  } catch (error) {
    console.error(
      "[ACA Locale] Usage summary proxy failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to load translation usage summary.",
      },
      {
        status: 502,
      },
    );
  }
}