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

  const jobId =
    params.id;

  if (!jobId) {
    return Response.json(
      {
        message:
          "Missing translation job ID.",
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
    const response =
      await fetch(
        `${backendUrl}/api/v1/translations/jobs/${encodeURIComponent(
          jobId,
        )}/cancel`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              authorization,
          },
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
      "[ACA Locale] Translation job cancel failed:",
      error,
    );

    return Response.json(
      {
        message:
          "Translation job cancel failed.",
      },
      {
        status: 502,
      },
    );
  }
}
