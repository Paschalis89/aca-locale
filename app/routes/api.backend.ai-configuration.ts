import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

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
        `${getBackendUrl()}/api/v1/ai/configuration`,
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
      "[ACA Locale] Unable to load AI configuration:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to load AI configuration.",
      },
      {
        status: 502,
      },
    );
  }
}

export async function action({
  request,
}: ActionFunctionArgs) {
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
    const requestBody =
      await request.text();

    const response =
      await fetch(
        `${getBackendUrl()}/api/v1/ai/configuration`,
        {
          method:
            "PATCH",

          headers: {
            Authorization:
              authorization,

            "Content-Type":
              "application/json",
          },

          body:
            requestBody,
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
      "[ACA Locale] Unable to update AI configuration:",
      error,
    );

    return Response.json(
      {
        message:
          "Unable to update AI configuration.",
      },
      {
        status: 502,
      },
    );
  }
}