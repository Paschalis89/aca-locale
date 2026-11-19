import type { LoaderFunctionArgs } from "react-router";
function getBackendUrl() {
  return (
    process.env
      .ACA_LOCALE_BACKEND_URL ??
    "http://127.0.0.1:3001"
  );
}

function getAuthorization(
  request: Request,
) {
  return request.headers.get(
    "authorization",
  );
}

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const authorization =
    getAuthorization(
      request,
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

  try {
    const response =
      await fetch(
        `${getBackendUrl()}/api/v1/translations/jobs/review/queue${new URL(request.url).search}`,
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
      "[ACA Locale] Unable to load review queue:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to load review queue.",
      },
      {
        status: 502,
      },
    );
  }
}
