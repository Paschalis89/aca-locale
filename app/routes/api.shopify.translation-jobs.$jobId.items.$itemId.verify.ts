import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readBackShopifyTranslation } from "../lib/shopify-publication-verification.server";

// Read-only, on-demand verification. No Prisma write and no Shopify mutation.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const { jobId, itemId } = params;
  if (!jobId || !itemId) {
    return Response.json({ message: "Missing job or item ID." }, { status: 400 });
  }
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return Response.json({ message: "Missing Shopify ID token." }, { status: 401 });
  }
  const backendUrl = process.env.ACA_LOCALE_BACKEND_URL ?? "http://127.0.0.1:3001";
  try {
    const response = await fetch(
      `${backendUrl}/api/v1/translations/jobs/${encodeURIComponent(jobId)}`,
      { headers: { Authorization: authorization } },
    );
    if (!response.ok) {
      return Response.json({ message: "Unable to read translation job." }, { status: response.status });
    }
    const job = await response.json();
    const item = job.items?.find((candidate: any) => candidate.id === itemId);
    if (!item) return Response.json({ message: "Item not found in job." }, { status: 404 });
    if (item.status !== "PUBLISHED") {
      return Response.json({ message: "Only PUBLISHED translations can be verified." }, { status: 409 });
    }
    const resourceId = item.field?.resource?.shopifyResourceId;
    const fieldKey = item.field?.key;
    const locale = job.targetLocale;
    const approvedValue = item.approvedValue;
    if (!resourceId || !fieldKey || !locale || typeof approvedValue !== "string") {
      return Response.json({ message: "Incomplete published translation identity." }, { status: 409 });
    }
    const verification = await readBackShopifyTranslation(admin, {
      resourceId, fieldKey, locale, approvedValue,
    });
    return Response.json({ verification, itemId, jobId }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[ACA Locale] Publication verification failed:", error);
    return Response.json({ message: "Unable to verify Shopify translation.",
      verification: { status: "VERIFICATION_FAILED" } }, { status: 502 });
  }
}
