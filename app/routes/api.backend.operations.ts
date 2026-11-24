import type { LoaderFunctionArgs } from 'react-router';

/** Shopify ID token is validated again by the NestJS ShopifyAuthGuard. */
export async function loader({ request }: LoaderFunctionArgs) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) {
    return Response.json({ message: 'Missing Shopify ID token.' }, { status: 401 });
  }
  const backendUrl = process.env.ACA_LOCALE_BACKEND_URL ?? 'http://127.0.0.1:3001';
  try {
    const response = await fetch(`${backendUrl}/api/v1/operations/snapshot`, {
      headers: { Authorization: authorization }, signal: AbortSignal.timeout(8000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ message: 'Operations snapshot unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
