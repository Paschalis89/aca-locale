import type {
  LoaderFunctionArgs,
} from "react-router";

export async function loader({
  request,
  params,
}: LoaderFunctionArgs) {
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
        )}`,
        {
          headers: {
            Authorization:
              authorization,
          },
        },
      );

    const body =
      await response.text();

    return new Response(
      body,
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
      "[ACA Locale] Unable to load translation job:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to load translation job.",
      },
      {
        status: 502,
      },
    );
  }
}