import type { ActionFunctionArgs } from "react-router";

/** Shopify session's bearer ID token is forwarded only server-to-server. */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ message: "Method not allowed" }, { status: 405 });
  const authorization = request.headers.get("authorization");
  if (!authorization) return Response.json({ message: "Missing Shopify ID token" }, { status: 401 });
  try {
    const body = await request.text();
    const url = process.env.ACA_LOCALE_BACKEND_URL ?? "http://127.0.0.1:3001";
    const response = await fetch(`${url}/api/v1/ai/usage-pricing/preview`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body,
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    console.error("[ACA Locale] Unable to preview pricing:", error);
    return Response.json({ message: "Unable to preview pricing" }, { status: 502 });
  }
}
