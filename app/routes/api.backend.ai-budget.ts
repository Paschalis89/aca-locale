import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
const backend = () => process.env.ACA_LOCALE_BACKEND_URL ?? 'http://127.0.0.1:3001';
async function forward(request: Request, method: 'GET' | 'PATCH') {
  const authorization = request.headers.get('authorization');
  if (!authorization) return Response.json({ message: 'Missing Shopify ID token.' }, { status: 401 });
  try {
    const response = await fetch(`${backend()}/api/v1/ai/budget`, {
      method, headers: { Authorization: authorization, ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'PATCH' ? { body: await request.text() } : {}),
    });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' } });
  } catch (error) {
    console.error('[ACA Locale] AI budget backend unavailable:', error);
    return Response.json({ message: 'AI budget service unavailable.' }, { status: 502 });
  }
}
export async function loader({ request }: LoaderFunctionArgs) { return forward(request, 'GET'); }
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'PATCH') return Response.json({ message: 'Method not allowed.' }, { status: 405 });
  return forward(request, 'PATCH');
}
