import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/** Verified Shopify webhook: never trusts a shop name or session id from JSON. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);

  // Webhooks can legitimately arrive after uninstall or token rotation.
  // In that case there is no session to update, and repeated delivery is safe.
  if (!session) return new Response(null, { status: 200 });

  const current = (payload as { current?: unknown })?.current;
  if (!Array.isArray(current) ||
      !current.every((scope) => typeof scope === "string" &&
        /^[a-z][a-z0-9_]*$/.test(scope))) {
    // Invalid verified payload: do not mutate stored scopes or pretend success.
    return new Response("Invalid scopes payload.", { status: 400 });
  }

  // Avoid Prisma P2025 if another webhook already removed the session.
  // Scope order is not meaningful; de-duplicate for idempotence.
  await db.session.updateMany({
    where: { id: session.id, shop: session.shop },
    data: { scope: [...new Set(current)].sort().join(",") },
  });
  return new Response(null, { status: 200 });
};
