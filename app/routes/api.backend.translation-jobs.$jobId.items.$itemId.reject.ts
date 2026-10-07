import type {
  ActionFunctionArgs,
} from "react-router";

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
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
        status: 400,
      },
    );
  }

  const backendUrl =
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001";

  try {
    const body =
      await request.text();

    const response =
      await fetch(
        `${backendUrl}/api/v1/translations/jobs/${encodeURIComponent(
          jobId,
        )}/items/${encodeURIComponent(
          itemId,
        )}/reject`,
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
            body ||
            "{}",
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
  } catch (error) {
    console.error(
      "[ACA Locale] Reject failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Translation rejection failed.",
      },
      {
        status: 502,
      },
    );
  }
}